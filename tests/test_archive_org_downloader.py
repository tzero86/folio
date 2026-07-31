import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import archive_org_downloader as downloader


class TestBookIdParsing(unittest.TestCase):
    def test_canonical_url(self):
        self.assertEqual(
            downloader.book_id_from_url("https://archive.org/details/cannibalsnovelab0000keef"),
            "cannibalsnovelab0000keef"
        )

    def test_url_with_page_mode(self):
        self.assertEqual(
            downloader.book_id_from_url("https://archive.org/details/cannibalsnovelab0000keef/page/8/mode/2up"),
            "cannibalsnovelab0000keef"
        )

    def test_url_with_trailing_slash(self):
        self.assertEqual(
            downloader.book_id_from_url("https://archive.org/details/cannibalsnovelab0000keef/"),
            "cannibalsnovelab0000keef"
        )

    def test_raw_id(self):
        self.assertEqual(downloader.book_id_from_url("IntermediatePython"), "IntermediatePython")


class TestStatusCallbackHook(unittest.TestCase):
    def _patch_downloader(self, get_book_infos_side_effect=None, download_side_effect=None):
        calls = []

        def fake_login(email, password):
            return "fake-session"

        def fake_loan(session, book_id, verbose=True):
            return session

        def fake_get_book_infos(session, url):
            if get_book_infos_side_effect:
                return get_book_infos_side_effect(session, url)
            return ("Test_Title", ["link1"], {})

        def fake_download(session, n_threads, directory, links, scale, book_id):
            if download_side_effect:
                return download_side_effect(session, n_threads, directory, links, scale, book_id)
            return ["link1.jpg"]

        def fake_return_loan(session, book_id):
            return None

        def fake_make_pdf(pdf, title, directory):
            return None

        original_login = downloader.login
        original_loan = downloader.loan
        original_get_book_infos = downloader.get_book_infos
        original_download = downloader.download
        original_return_loan = downloader.return_loan
        original_make_pdf = downloader.make_pdf

        try:
            downloader.login = fake_login
            downloader.loan = fake_loan
            downloader.get_book_infos = fake_get_book_infos
            downloader.download = fake_download
            downloader.return_loan = fake_return_loan
            downloader.make_pdf = fake_make_pdf
            yield calls
        finally:
            downloader.login = original_login
            downloader.loan = original_loan
            downloader.get_book_infos = original_get_book_infos
            downloader.download = original_download
            downloader.return_loan = original_return_loan
            downloader.make_pdf = original_make_pdf

    def test_callback_receives_started_and_done(self):
        from contextlib import contextmanager

        @contextmanager
        def patch():
            yield from self._patch_downloader()

        calls = []
        with patch():
            downloader.process_downloads(
                email="test@test.com",
                password="test",
                urls=["https://archive.org/details/testbookid"],
                output_dir="/tmp",
                jpg_output=True,
                status_callback=lambda book_id, status, message="": calls.append((book_id, status))
            )

        self.assertIn(("testbookid", "started"), calls)
        self.assertIn(("testbookid", "done"), calls)

    def test_callback_receives_error(self):
        from contextlib import contextmanager

        @contextmanager
        def patch():
            def failing_get_book_infos(session, url):
                raise RuntimeError("metadata fetch failed")
            yield from self._patch_downloader(get_book_infos_side_effect=failing_get_book_infos)

        calls = []
        with patch():
            downloader.process_downloads(
                email="test@test.com",
                password="test",
                urls=["https://archive.org/details/testbookid"],
                output_dir="/tmp",
                jpg_output=True,
                status_callback=lambda book_id, status, message="": calls.append((book_id, status))
            )

        self.assertIn(("testbookid", "error"), calls)


if __name__ == '__main__':
    unittest.main()
