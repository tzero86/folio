import requests
import random, string
from concurrent import futures
from tqdm import tqdm
import time
from datetime import datetime
import argparse
import os
import sys
import shutil
import json
import re
import base64
import hashlib
from Crypto.Cipher import AES
from Crypto.Util import Counter

def display_error(response, message):
	print(message)
	print(response)
	print(response.text)
	raise Exception(message)

def get_book_infos(session, url):
	r = session.get(url).text
	infos_url = "https:" + r.split('"url":"')[1].split('"')[0].replace("\\u0026", "&")
	response = session.get(infos_url)
	data = response.json()['data']
	title = data['brOptions']['bookTitle'].strip().replace(" ", "_")
	title = ''.join( c for c in title if c not in '<>:"/\\|?*' ) # Filter forbidden chars in directory names (Windows & Linux)
	title = title[:150] # Trim the title to avoid long file names	
	metadata = data['metadata']
	links = []
	for item in data['brOptions']['data']:
		for page in item:
			links.append(page['uri'])

	if len(links) > 1:
		print(f"[+] Found {len(links)} pages")
		return title, links, metadata
	else:
		raise Exception("Error while getting image links")

def book_id_from_url(url: str) -> str:
	"""Extract the Archive.org identifier from a /details/ URL or return a raw ID."""
	url = url.rstrip('/')
	if not url.startswith("http"):
		return url
	parts = url.split('/')
	if len(parts) >= 5 and parts[2] == 'archive.org' and parts[3] == 'details':
		return parts[4]
	raise ValueError(f"Cannot extract book id from URL: {url}")

def login(email, password):
	session = requests.Session()
	response = session.get("https://archive.org/services/account/login/")
	login_data = response.json()
	if not login_data['success']:
		display_error(response, "[-] Error while getting login token:")

	login_token = login_data["value"]["token"]

	headers = {"Content-Type": "application/x-www-form-urlencoded"}
	data = {"username":email, "password":password, "t": login_token}
	
	response = session.post("https://archive.org/services/account/login/", headers=headers, data=json.dumps(data))
	try:
		response_json = response.json()
	except:
		display_error(response, "[-] Error while login:")
	
	if response_json["success"] == False:
		if response_json["value"] == "bad_login":
			raise Exception("[-] Invalid credentials!")
		display_error(response, "[-] Error while login:")
	else:
		print("[+] Successful login")
		return session

def loan(session, book_id, verbose=True):
	data = {
		"action": "grant_access",
		"identifier": book_id
	}
	response = session.post("https://archive.org/services/loans/loan/searchInside.php", data=data)
	data['action'] = "browse_book"
	response = session.post("https://archive.org/services/loans/loan/", data=data)

	if response.status_code == 400 :
		try:
			if response.json()["error"] == "This book is not available to borrow at this time. Please try again later.":
				print("This book doesn't need to be borrowed")
				return session
			else :
				display_error(response, "Something went wrong when trying to borrow the book.")
		except: # The response is not in JSON format
			display_error(response, "The book cannot be borrowed")

	data['action'] = "create_token"
	response = session.post("https://archive.org/services/loans/loan/", data=data)

	if "token" in response.text:
		if verbose:
			print("[+] Successful loan")
		return session
	else:
		display_error(response, "Something went wrong when trying to borrow the book, maybe you can't borrow this book.")

def return_loan(session, book_id):
	data = {
		"action": "return_loan",
		"identifier": book_id
	}
	response = session.post("https://archive.org/services/loans/loan/", data=data)
	if response.status_code == 200 and response.json()["success"]:
		print("[+] Book returned")
	else:
		display_error(response, "Something went wrong when trying to return the book")

def image_name(pages, page, directory):
	return f"{directory}/{(len(str(pages)) - len(str(page))) * '0'}{page}.jpg"

def deobfuscate_image(image_data, link, obf_header):
	"""
	@Author: https://github.com/justimm
	Decrypts the first 1024 bytes of image_data using AES-CTR.
	The obfuscation_header is expected in the form "1|<base64encoded_counter>"
	where the base64-decoded counter is 16 bytes.
	We derive the AES key by taking the SHA-1 digest of the image URL (with protocol/host removed)
	and using the first 16 bytes.
	For AES-CTR, we use a 16-byte counter block. The first 8 bytes are used as a fixed prefix,
	and the remaining 8 bytes (interpreted as a big-endian integer) are used as the initial counter value.
	"""
	try:
		version, counter_b64 = obf_header.split('|')
	except Exception as e:
		raise ValueError("Invalid X-Obfuscate header format") from e

	if version != '1':
		raise ValueError("Unsupported obfuscation version: " + version)

	# Derive AES key: replace protocol/host in link with '/'
	aesKey = re.sub(r"^https?:\/\/.*?\/", "/", link)
	sha1_digest = hashlib.sha1(aesKey.encode('utf-8')).digest()
	key = sha1_digest[:16]

	# Decode the counter (should be 16 bytes)
	counter_bytes = base64.b64decode(counter_b64)
	if len(counter_bytes) != 16:
		raise ValueError(f"Expected counter to be 16 bytes, got {len(counter_bytes)}")

	prefix = counter_bytes[:8]
	initial_value = int.from_bytes(counter_bytes[8:], byteorder='big')

	# Create AES-CTR cipher with a 64-bit counter length.
	ctr = Counter.new(64, prefix=prefix, initial_value=initial_value, little_endian=False)
	cipher = AES.new(key, AES.MODE_CTR, counter=ctr)

	decrypted_part = cipher.decrypt(image_data[:1024])
	new_data = decrypted_part + image_data[1024:]
	return new_data	

from datetime import datetime, timezone
import argparse
import os
import sys
import shutil
import json
import re
import base64
import hashlib
from urllib.parse import urlparse
from concurrent import futures
from Crypto.Cipher import AES
from Crypto.Util import Counter

import threading

_SESSION_LOCK = threading.Lock()

def download_one_image(session, link, i, directory, book_id, pages, max_retries=3):
    headers = {
        "Referer": "https://archive.org/",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Sec-Fetch-Site": "same-site",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Dest": "image",
    }

    image = image_name(pages, i, directory)
    last_exception = None

    for attempt in range(max_retries):
        try:
            response = session.get(link, headers=headers)
            if response.status_code == 403:
                # Re-borrow synchronizes access to the shared session cookie jar.
                with _SESSION_LOCK:
                    loan(session, book_id, verbose=False)
                response = session.get(link, headers=headers)
                if response.status_code == 403:
                    raise Exception("Access still denied after re-borrow")
            if response.status_code == 200:
                break
            raise Exception(f"HTTP {response.status_code}")
        except Exception as e:
            last_exception = e
            if attempt < max_retries - 1:
                time.sleep(1)
            continue
    else:
        print(f"[ERROR] Failed to download page {i} after {max_retries} attempts: {last_exception}")
        return

    sample = response.content[:200]
    if b"Page temporarily unavailable" in response.content or b"limited preview" in response.content:
        print(f"[WARN] Page {i} returned preview page ({response.status_code}, len={len(response.content)}): {sample!r}")

    obf_header = response.headers.get("X-Obfuscate")
    if obf_header:
        try:
            image_content = deobfuscate_image(response.content, link, obf_header)
        except Exception as e:
            print(f"[ERROR] Deobfuscation failed for page {i}: {e}")
            return
    else:
        image_content = response.content

    with open(image, "wb") as f:
        f.write(image_content)

def download(session, n_threads, directory, links, scale, book_id):
    print("Downloading pages...")
    links = [f"{link}&rotate=0&scale={scale}" for link in links]
    pages = len(links)

    images = []
    with futures.ThreadPoolExecutor(max_workers=n_threads) as executor:
        tasks = []
        for i, link in enumerate(links):
            tasks.append(executor.submit(download_one_image, session=session, link=link, i=i, directory=directory, book_id=book_id, pages=pages))
        for task in tqdm(futures.as_completed(tasks), total=len(tasks)):
            pass

    for i in range(pages):
        image = image_name(pages, i, directory)
        if os.path.exists(image):
            images.append(image)
        else:
            print(f"[WARN] Missing page image: {image}")

    return images

def fetch_book_metadata(book_id: str) -> dict:
    """Fetch public metadata for a book without requiring login."""
    session = requests.Session()
    url = f"https://archive.org/details/{book_id}"
    try:
        r = session.get(url).text
        infos_url = "https:" + r.split('"url":"')[1].split('"')[0].replace("\\u0026", "&")
        response = session.get(infos_url)
        return response.json()['data']['metadata']
    except Exception:
        return {}

def make_pdf(pdf, title, directory):
	file = title+".pdf"
	# Handle the case where multiple books with the same name are downloaded
	i = 1
	while os.path.isfile(os.path.join(directory, file)):
		file = f"{title}({i}).pdf"
		i += 1

	with open(os.path.join(directory, file),"wb") as f:
		f.write(pdf)
	print(f"[+] PDF saved as \"{file}\"")
	return file


def process_downloads(email, password, urls, output_dir, resolution=3, threads=50, jpg_output=False, meta_output=False, status_callback=None):
    """Main logic to process the list of URLs."""
    if not output_dir:
        output_dir = os.getcwd()
    os.makedirs(output_dir, exist_ok=True)

    valid_urls = []
    for url in urls:
        if not url.startswith("https://archive.org/details/"):
            print(f"{url} --> Invalid url. URL must start with \"https://archive.org/details/\"")
        else:
            valid_urls.append(url)

    if not valid_urls:
        print("No valid URLs to process.")
        return

    print(f"{len(valid_urls)} Book(s) to download")
    session = login(email, password)

    for url in valid_urls:
        book_id = None
        try:
            # Normalize URL to the canonical /details/<id> path
            book_id = book_id_from_url(url)
            canonical_url = f"https://archive.org/details/{book_id}"

            if status_callback:
                status_callback(book_id, 'started')

            print("="*40)
            session = loan(session, book_id)
            print(f"Current book: {canonical_url}")
            title, links, metadata = get_book_infos(session, canonical_url)

            directory = os.path.join(output_dir, title)
            i = 1
            _directory = directory
            while os.path.isdir(directory):
                directory = f"{_directory}({i})"
                i += 1
            os.makedirs(directory)

            if meta_output:
                print("Writing metadata.json...")
                with open(f"{directory}/metadata.json", 'w') as f:
                    json.dump(metadata, f)

            images = download(session, threads, directory, links, resolution, book_id)

            if not jpg_output:
                import img2pdf

                pdfmeta = {}
                for key in ["title", "creator", "associated-names"]:
                    if key in metadata:
                        if isinstance(metadata[key], list):
                            metadata[key] = "; ".join(metadata[key])
                        elif not isinstance(metadata[key], str):
                            raise Exception("unsupported metadata type")

                if 'title' in metadata:
                    pdfmeta['title'] = metadata['title']
                if 'creator' in metadata and 'associated-names' in metadata:
                    pdfmeta['author'] = metadata['creator'] + "; " + metadata['associated-names']
                elif 'creator' in metadata:
                    pdfmeta['author'] = metadata['creator']
                elif 'associated-names' in metadata:
                    pdfmeta['author'] = metadata['associated-names']
                if 'date' in metadata:
                    try:
                        pdfmeta['creationdate'] = datetime.strptime(metadata['date'][0:4], '%Y').replace(tzinfo=timezone.utc)
                    except Exception:
                        pass
                pdfmeta['keywords'] = [canonical_url]

                pdf_file = None
                if images:
                    pdf = img2pdf.convert(images, **pdfmeta)
                    pdf_file = make_pdf(pdf, title, output_dir)
                    try:
                        shutil.rmtree(directory)
                    except OSError as e:
                        print("Error: %s - %s." % (e.filename, e.strerror))
                else:
                    print("No images downloaded, skipping PDF creation.")
            else:
                pdf_file = None

            if status_callback:
                status_callback(book_id, 'done', pdf_file or "")

            return_loan(session, book_id)
        except Exception as e:
            print(f"Error processing {url}: {e}")
            if status_callback and book_id:
                status_callback(book_id, 'error', str(e))
            if book_id is not None:
                try:
                    return_loan(session, book_id)
                except Exception:
                    pass

def main():
    my_parser = argparse.ArgumentParser()
    my_parser.add_argument('-e', '--email', help='Your archive.org email', type=str, required=True)
    my_parser.add_argument('-p', '--password', help='Your archive.org password', type=str, required=True)
    my_parser.add_argument('-u', '--url', help='Link to the book (https://archive.org/details/XXXX). You can use this argument several times to download multiple books', action='append', type=str)
    my_parser.add_argument('-d', '--dir', help='Output directory', type=str)
    my_parser.add_argument('-f', '--file', help='File where are stored the URLs of the books to download', type=str)
    my_parser.add_argument('-r', '--resolution', help='Image resolution (10 to 0, 0 is the highest), [default 3]', type=int, default=3)
    my_parser.add_argument('-t', '--threads', help="Maximum number of threads, [default 50]", type=int, default=50)
    my_parser.add_argument('-j', '--jpg', help="Output to individual JPG's rather than a PDF", action='store_true')
    my_parser.add_argument('-m', '--meta', help="Output the metadata of the book to a json file (-j option required)", action='store_true')

    if len(sys.argv) == 1:
        my_parser.print_help(sys.stderr)
        sys.exit(1)
    args = my_parser.parse_args()

    if args.url is None and args.file is None:
        my_parser.error("At least one of --url and --file required")

    email = args.email
    password = args.password
    scale = args.resolution
    n_threads = args.threads
    d = args.dir
    if d is None:
        d = os.getcwd()

    urls = []
    if args.url is not None:
        urls.extend(args.url)
    
    if args.file:
        if os.path.exists(args.file):
            with open(args.file) as f:
                urls.extend(f.read().strip().split("\n"))
        else:
            print(f"{args.file} does not exist!")
            sys.exit(1)

    process_downloads(email, password, urls, d, scale, n_threads, args.jpg, args.meta)

if __name__ == "__main__":
    main()

