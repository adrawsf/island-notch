//! PNG encode/decode through the Windows imaging API (no extra crates).
//! Pixels are always BGRA, 8 bits per channel, top-down rows.
#![cfg(windows)]

use windows::core::Result;
use windows::Graphics::Imaging::{
    BitmapAlphaMode, BitmapDecoder, BitmapEncoder, BitmapInterpolationMode, BitmapPixelFormat, BitmapTransform,
    ColorManagementMode, ExifOrientationMode,
};
use windows::Storage::Streams::{DataReader, DataWriter, IBuffer, InMemoryRandomAccessStream};

/// A bitmap in memory: BGRA, `width * height * 4` bytes.
pub struct Bgra {
    pub pixels: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// Copies bytes into a WinRT buffer.
pub fn buffer(bytes: &[u8]) -> Result<IBuffer> {
    let writer = DataWriter::new()?;
    writer.WriteBytes(bytes)?;
    writer.DetachBuffer()
}

/// Encodes as PNG, optionally scaled to `scaled` (width, height).
pub fn encode_png(image: &Bgra, scaled: Option<(u32, u32)>) -> Result<Vec<u8>> {
    let stream = InMemoryRandomAccessStream::new()?;
    let encoder = BitmapEncoder::CreateAsync(BitmapEncoder::PngEncoderId()?, &stream)?.get()?;
    encoder.SetPixelData(
        BitmapPixelFormat::Bgra8,
        BitmapAlphaMode::Straight,
        image.width,
        image.height,
        96.0,
        96.0,
        &image.pixels,
    )?;
    if let Some((w, h)) = scaled {
        let transform = encoder.BitmapTransform()?;
        transform.SetScaledWidth(w.max(1))?;
        transform.SetScaledHeight(h.max(1))?;
        transform.SetInterpolationMode(BitmapInterpolationMode::Fant)?;
    }
    encoder.FlushAsync()?.get()?;

    let size = stream.Size()? as u32;
    let reader = DataReader::CreateDataReader(&stream.GetInputStreamAt(0)?)?;
    reader.LoadAsync(size)?.get()?;
    let mut out = vec![0u8; size as usize];
    reader.ReadBytes(&mut out)?;
    Ok(out)
}

/// Decodes a PNG (or any format Windows can read) to BGRA.
pub fn decode(bytes: &[u8]) -> Result<Bgra> {
    let stream = InMemoryRandomAccessStream::new()?;
    stream.WriteAsync(&buffer(bytes)?)?.get()?;
    stream.Seek(0)?;
    let decoder = BitmapDecoder::CreateAsync(&stream)?.get()?;
    let provider = decoder
        .GetPixelDataTransformedAsync(
            BitmapPixelFormat::Bgra8,
            BitmapAlphaMode::Straight,
            &BitmapTransform::new()?,
            ExifOrientationMode::IgnoreExifOrientation,
            ColorManagementMode::DoNotColorManage,
        )?
        .get()?;
    Ok(Bgra {
        pixels: provider.DetachPixelData()?.to_vec(),
        width: decoder.PixelWidth()?,
        height: decoder.PixelHeight()?,
    })
}
