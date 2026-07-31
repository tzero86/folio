mod commands;
mod downloader;
mod library;

use commands::download::download_books;
use commands::library::{add_library_book, list_library_books, find_library_book, delete_library_book};
use commands::metadata::fetch_book_metadata;
use commands::update::check_update;
use sqlx::sqlite::SqlitePool;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
            download_books,
            check_update,
            add_library_book,
            list_library_books,
            find_library_book,
            delete_library_book,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
