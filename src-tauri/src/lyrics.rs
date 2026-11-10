//! HTTP access to the LRCLIB lyrics API (https://lrclib.net).
//!
//! Only this fixed host and two endpoints can be reached, so the frontend can
//! pass query parameters but never an arbitrary URL. Matching and LRC parsing
//! live in the frontend (`src/features/lyrics/`).

use std::time::Duration;

const BASE_URL: &str = "https://lrclib.net/api";
const USER_AGENT: &str = concat!("IslandNotch/", env!("CARGO_PKG_VERSION"));
const TIMEOUT: Duration = Duration::from_secs(8);

/// Calls `/api/get` or `/api/search` with the given query parameters.
/// Returns the JSON body, or `null` when LRCLIB has no entry (404).
#[tauri::command]
pub async fn lrclib_request(endpoint: String, query: Vec<(String, String)>) -> Result<serde_json::Value, String> {
    let path = match endpoint.as_str() {
        "get" => "get",
        "search" => "search",
        other => return Err(format!("unsupported LRCLIB endpoint: {other}")),
    };
    tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::AgentBuilder::new().timeout(TIMEOUT).user_agent(USER_AGENT).build();
        let mut request = agent.get(&format!("{BASE_URL}/{path}"));
        for (key, value) in &query {
            request = request.query(key, value);
        }
        match request.call() {
            Ok(response) => response.into_json::<serde_json::Value>().map_err(|e| e.to_string()),
            Err(ureq::Error::Status(404, _)) => Ok(serde_json::Value::Null),
            Err(ureq::Error::Status(code, _)) => Err(format!("LRCLIB HTTP {code}")),
            Err(err) => Err(err.to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
