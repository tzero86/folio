use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{Context, Result};

pub async fn download_image(
    client: &reqwest::Client,
    link: &str,
    book_id: &str,
    output_path: &Path,
    cancel: Arc<AtomicBool>,
) -> Result<()> {
    let max_retries = 3;
    let mut last_error = None;

    for attempt in 0..max_retries {
        if cancel.load(Ordering::Relaxed) {
            anyhow::bail!("cancelled");
        }
        let response = client
            .get(link)
            .header("Referer", "https://archive.org/")
            .header("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
            .header("Sec-Fetch-Site", "same-site")
            .header("Sec-Fetch-Mode", "no-cors")
            .header("Sec-Fetch-Dest", "image")
            .send()
            .await;

        let response = match response {
            Ok(r) => r,
            Err(e) => {
                last_error = Some(e.into());
                if attempt < max_retries - 1 {
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                }
                continue;
            }
        };

        if response.status() == reqwest::StatusCode::FORBIDDEN {
            super::archive::loan_book(client, book_id).await.ok();
            last_error = Some(anyhow::anyhow!("access denied (403)"));
            if attempt < max_retries - 1 {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
            continue;
        }

        let status = response.status();
        if !status.is_success() {
            last_error = Some(anyhow::anyhow!("HTTP {status} downloading {link}"));
            if attempt < max_retries - 1 {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
            continue;
        }

        let obf_header = response
            .headers()
            .get("X-Obfuscate")
            .and_then(|h| h.to_str().ok())
            .map(|s| s.to_string());

        let mut bytes = response.bytes().await?.to_vec();
        if let Some(header) = obf_header {
            super::crypto::deobfuscate_image(&mut bytes, link, &header)
                .with_context(|| format!("deobfuscating {link}"))?;
        }

        tokio::fs::write(output_path, bytes).await?;
        return Ok(());
    }

    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("download failed after {max_retries} attempts")))
}
