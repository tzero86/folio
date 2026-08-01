mod commands;
mod downloader;
mod library;
mod tracing_logger;

use commands::download::download_books;
use commands::library::{add_library_book, list_library_books, find_library_book, delete_library_book};
use commands::metadata::fetch_book_metadata;
use commands::search::search_archive;
use sqlx::sqlite::SqlitePool;
use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tauri::Manager;

/// Per-identifier cancellation flags for in-flight downloads.
pub type CancellationMap = Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>;

#[tauri::command]
fn cancel_download(identifier: String, cancellations: tauri::State<CancellationMap>) -> Result<(), String> {
    let map = cancellations.lock().map_err(|e| e.to_string())?;
    if let Some(flag) = map.get(&identifier) {
        flag.store(true, std::sync::atomic::Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
fn get_logs(last_count: usize) -> (Vec<String>, usize) {
    let all = tracing_logger::get_logs();
    let new = if last_count < all.len() {
        all[last_count..].to_vec()
    } else {
        Vec::new()
    };
    (new, all.len())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_logger::init_tracing();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            // Window is created in code so we can disable WebView2's zoom
            // hotkeys - otherwise Ctrl+wheel is eaten by browser-level page
            // zoom and never reaches the PDF viewer's zoom handler.
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                .title("Folio")
                .inner_size(1200.0, 800.0)
                .min_inner_size(900.0, 650.0)
                .center()
                .zoom_hotkeys_enabled(false)
                .build()
                .expect("failed to create main window");

            app.manage::<CancellationMap>(Arc::new(Mutex::new(HashMap::new())));
            let rt = tauri::async_runtime::handle();
            let pool = rt.block_on(async {
                let app_dir = app.path().app_data_dir().expect("app data dir");
                std::fs::create_dir_all(&app_dir).ok();
                let db_path = app_dir.join("library.db");
                let pool = SqlitePool::connect(&format!("sqlite:{}?mode=rwc", db_path.display()))
                    .await
                    .expect("failed to create database");
                library::init_db(&pool).await.expect("failed to init db");
                pool
            });
            app.manage(pool);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_book_metadata,
            search_archive,
            download_books,
            cancel_download,
            get_logs,
            add_library_book,
            list_library_books,
            find_library_book,
            delete_library_book,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
