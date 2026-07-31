use serde::Deserialize;
use tauri::{command, AppHandle, Emitter};

use crate::downloader::archive::login;

#[derive(Debug, Deserialize)]
pub struct DownloadRequest {
    pub email: String,
    pub password: String,
    pub identifiers: Vec<String>,
    pub output_dir: String,
    pub resolution: i32,
    pub create_pdf: bool,
    pub save_credentials: bool,
    pub save_metadata: bool,
}

#[command]
pub async fn download_books(request: DownloadRequest, app_handle: AppHandle) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .cookie_store(true)
        .http1_only()
        .pool_max_idle_per_host(50)
        .tcp_keepalive(Some(std::time::Duration::from_secs(30)))
        .build()
        .map_err(|e| e.to_string())?;

    login(&client, &request.email, &request.password)
        .await
        .map_err(|e| format!("login failed: {e}"))?;

    let output_dir = std::path::PathBuf::from(&request.output_dir);
    tokio::fs::create_dir_all(&output_dir)
        .await
        .map_err(|e| format!("output directory error: {e}"))?;

    for id in request.identifiers {
        let app = app_handle.clone();
        let c = client.clone();
        let out = output_dir.clone();
        let resolution = request.resolution;
        let create_pdf = request.create_pdf;
        let save_metadata = request.save_metadata;
        let id_clone = id.clone();

        tauri::async_runtime::spawn(async move {
            let res = crate::downloader::orchestrator::download_book(
                &c,
                &id_clone,
                &out,
                resolution,
                create_pdf,
                save_metadata,
                |status, detail| {
                    let mut payload = serde_json::json!({
                        "id": id_clone,
                        "status": status,
                    });
                    if let Some(d) = detail {
                        if status == "done" {
                            payload["pdf"] = d.into();
                        } else if status == "downloading" {
                            if let Some((current, rest)) = d.split_once(":") {
                                payload["current"] = current.into();
                                payload["total"] = rest.into();
                            } else {
                                payload["message"] = d.into();
                            }
                        } else {
                            payload["message"] = d.into();
                        }
                    }
                    app.emit("download-status", payload).ok();
                },
            )
            .await;

            if let Err(e) = res {
                app.emit(
                    "download-status",
                    serde_json::json!({
                        "id": id_clone,
                        "status": "error",
                        "message": e.to_string(),
                    }),
                )
                .ok();
            }
        });
    }

    Ok(())
}
