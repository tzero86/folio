use std::sync::{Arc, Mutex};
use std::sync::LazyLock;
use std::time::{Duration, Instant};

use serde::Deserialize;
use tauri::command;

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    html_url: String,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    browser_download_url: String,
    name: String,
}

#[derive(Clone)]
struct CachedUpdate {
    checked_at: Instant,
    url: Option<String>,
}

static UPDATE_CACHE: LazyLock<Arc<Mutex<Option<CachedUpdate>>>> =
    LazyLock::new(|| Arc::new(Mutex::new(None)));

#[command]
pub async fn check_update() -> Result<Option<String>, String> {
    {
        let guard = UPDATE_CACHE.lock().map_err(|e| e.to_string())?;
        if let Some(cached) = guard.as_ref() {
            if cached.checked_at.elapsed() < Duration::from_secs(300) {
                return Ok(cached.url.clone());
            }
        }
    }

    let url = match fetch_latest_release_url().await {
        Ok(Some(u)) => Some(u),
        Ok(None) => None,
        Err(_) => {
            let fallback = UPDATE_CACHE
                .lock()
                .ok()
                .and_then(|g| g.as_ref().map(|c| c.url.clone()))
                .flatten();
            return Ok(fallback);
        }
    };

    {
        let mut guard = UPDATE_CACHE.lock().map_err(|e| e.to_string())?;
        *guard = Some(CachedUpdate {
            checked_at: Instant::now(),
            url: url.clone(),
        });
    }

    Ok(url)
}

async fn fetch_latest_release_url() -> Result<Option<String>, String> {
    let release: GitHubRelease = reqwest::get(
        "https://api.github.com/repos/MiniGlome/Archive.org-Downloader/releases/latest",
    )
    .await
    .map_err(|e| e.to_string())?
    .json()
    .await
    .map_err(|e| e.to_string())?;

    let asset = release
        .assets
        .iter()
        .find(|a| {
            let name = a.name.to_lowercase();
            name.ends_with(".exe")
                || name.ends_with(".msi")
                || name.ends_with(".dmg")
                || name.ends_with(".appimage")
                || name.ends_with(".zip")
        })
        .map(|a| a.browser_download_url.clone());

    Ok(asset.or(Some(release.html_url)))
}
