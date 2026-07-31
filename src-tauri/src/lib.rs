mod commands;
mod downloader;
mod library;
mod tracing_logger;

use commands::download::download_books;
use commands::library::{add_library_book, list_library_books, find_library_book, delete_library_book};
use commands::metadata::fetch_book_metadata;
use commands::search::search_archive;
use commands::update::check_update;
use sqlx::sqlite::SqlitePool;
use tauri::Manager;

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

#[tauri::command]
fn read_pdf_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("failed to read {}: {e}", path))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_logger::init_tracing();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
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
            check_update,
            get_logs,
            read_pdf_bytes,
            add_library_book,
            list_library_books,
            find_library_book,
            delete_library_book,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
