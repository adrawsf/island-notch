//! HTTP access for lyrics providers.
//!
//! The frontend names an endpoint (e.g. `netease.search`) and passes query
//! parameters; the host, path and headers are fixed here. Only these
//! endpoints can be reached, so the command can never be pointed at an
//! arbitrary URL. Matching and parsing live in `src/features/lyrics/`.

use std::time::Duration;

const TIMEOUT: Duration = Duration::from_secs(8);
const APP_AGENT: &str = concat!("IslandNotch/", env!("CARGO_PKG_VERSION"));
/// Some providers reject unknown clients, so they get a browser agent.
const BROWSER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

struct Endpoint {
    url: &'static str,
    referer: Option<&'static str>,
    browser_agent: bool,
}

fn endpoint(id: &str) -> Option<Endpoint> {
    let (url, referer, browser_agent) = match id {
        "lrclib.get" => ("https://lrclib.net/api/get", None, false),
        "lrclib.search" => ("https://lrclib.net/api/search", None, false),
        "netease.search" => ("https://music.163.com/api/cloudsearch/pc", Some("https://music.163.com/"), true),
        "netease.lyric" => ("https://music.163.com/api/song/lyric", Some("https://music.163.com/"), true),
        "kugou.search" => ("https://krcs.kugou.com/search", None, true),
        "kugou.download" => ("https://lyrics.kugou.com/download", None, true),
        "qqmusic.search" => ("https://c.y.qq.com/soso/fcgi-bin/client_search_cp", Some("https://y.qq.com/"), true),
        "qqmusic.lyric" => ("https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg", Some("https://y.qq.com/"), true),
        "genius.search" => ("https://genius.com/api/search/multi", None, true),
        // The song page itself; its path comes from the search result and is validated below.
        "genius.page" => ("https://genius.com", None, true),
        _ => return None,
    };
    Some(Endpoint { url, referer, browser_agent })
}

/// A Genius song page path such as `/Hindia-evaluasi-lyrics`.
fn is_genius_song_path(path: &str) -> bool {
    path.len() < 200
        && path.starts_with('/')
        && path.ends_with("-lyrics")
        && path[1..].chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// GETs a provider endpoint. Returns the body, or `None` on 404 (no entry).
#[tauri::command]
pub async fn lyrics_request(
    endpoint: String,
    query: Vec<(String, String)>,
    path: Option<String>,
) -> Result<Option<String>, String> {
    let spec = self::endpoint(&endpoint).ok_or_else(|| format!("unknown lyrics endpoint: {endpoint}"))?;
    let url = match (endpoint.as_str(), path) {
        ("genius.page", Some(path)) if is_genius_song_path(&path) => format!("{}{}", spec.url, path),
        ("genius.page", _) => return Err("invalid Genius song path".into()),
        _ => spec.url.to_string(),
    };

    tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::AgentBuilder::new()
            .timeout(TIMEOUT)
            .user_agent(if spec.browser_agent { BROWSER_AGENT } else { APP_AGENT })
            .build();
        let mut request = agent.get(&url);
        if let Some(referer) = spec.referer {
            request = request.set("Referer", referer);
        }
        for (key, value) in &query {
            request = request.query(key, value);
        }
        match request.call() {
            Ok(response) => response.into_string().map(Some).map_err(|e| e.to_string()),
            Err(ureq::Error::Status(404, _)) => Ok(None),
            Err(ureq::Error::Status(code, _)) => Err(format!("{endpoint}: HTTP {code}")),
            Err(err) => Err(format!("{endpoint}: {err}")),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
