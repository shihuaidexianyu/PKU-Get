"""
Downloader - The actual work happens here.
No BS, just download files efficiently.
"""
import re
import time
import json
import base64
import threading
import requests
import mimetypes
import traceback
from collections import namedtuple
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from urllib.parse import urljoin, unquote, urlparse, parse_qs
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import os

from ..logger import get_logger

logger = get_logger('download')

# Set PKU_REPLAY_DEBUG=1 in your environment to enable verbose replay detection logging.
REPLAY_DEBUG: bool = os.environ.get('PKU_REPLAY_DEBUG', '').lower() in ('1', 'true', 'yes')


class Downloader:
    """Download files from PKU's course system. It's not pretty but it works."""
    
    COMMON_EXTENSIONS = [
        '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
        '.zip', '.rar', '.7z', '.tar', '.gz',
        '.txt', '.md', '.ipynb',
        '.jpg', '.jpeg', '.png', '.gif', '.swf',
        '.mp4', '.avi', '.mov', '.wmv', '.mpg', '.mpeg',
        '.mp3', '.wav', '.ogg'
    ]

    # Simple magic-signature based detection (fast, no extra deps)
    MagicHit = namedtuple('MagicHit', ['mime', 'ext'])
    MAGIC_PREFIXES: Dict[bytes, MagicHit] = {
        b"%PDF-": MagicHit('application/pdf', '.pdf'),
        b"PK\x03\x04": MagicHit('application/zip', '.zip'),  # also docx/pptx/xlsx containers
        b"Rar!": MagicHit('application/x-rar-compressed', '.rar'),
        b"7z\xBC\xAF\x27\x1C": MagicHit('application/x-7z-compressed', '.7z'),
        b"\x1F\x8B\x08": MagicHit('application/gzip', '.gz'),
        b"\x89PNG\r\n\x1a\n": MagicHit('image/png', '.png'),
        b"\xff\xd8\xff": MagicHit('image/jpeg', '.jpg'),
        b"GIF87a": MagicHit('image/gif', '.gif'),
        b"GIF89a": MagicHit('image/gif', '.gif'),
        b"ID3": MagicHit('audio/mpeg', '.mp3'),
        b"\x00\x00\x00\x18ftyp": MagicHit('video/mp4', '.mp4'),
        b"ftypisom": MagicHit('video/mp4', '.mp4'),
        b"ftypmp42": MagicHit('video/mp4', '.mp4'),
    }

    def _guess_from_magic(self, head: bytes) -> Optional[Tuple[str, str]]:
        """Return (mime, ext) if a known magic prefix matches."""
        for sig, hit in self.MAGIC_PREFIXES.items():
            if head.startswith(sig):
                return hit.mime, hit.ext
        return None

    def _choose_extension(self, filename: str, content_type: Optional[str], head: Optional[bytes]) -> Optional[Tuple[str, str, Optional[str]]]:
        """Decide a better extension for filename based on headers and magic.
        Returns a tuple (ext, source, mime) or None if we shouldn't change it.
        """
        # If filename already has a plausible extension, keep it
        base = filename.rsplit('/', 1)[-1]
        if '.' in base and base.lower().endswith(tuple(self.COMMON_EXTENSIONS)):
            return None

        # Try HTTP Content-Type
        if content_type and content_type != 'application/octet-stream':
            # Normalize and map to extension
            ext = mimetypes.guess_extension(content_type.split(';', 1)[0].strip())
            # Fix common None cases
            if not ext and content_type.startswith('image/jpeg'):
                ext = '.jpg'
            if ext:
                return (ext, 'content-type', content_type.split(';', 1)[0].strip())

        # Try magic bytes
        if head:
            hit = self._guess_from_magic(head)
            if hit:
                return (hit[1], 'magic', self._guess_from_magic(head)[0] if self._guess_from_magic(head) else None)

        # Heuristic for OOXML inside zip
        if head and head.startswith(b"PK\x03\x04"):
            # Don't force .zip — let original name stand if text hints exist
            return ('.zip', 'zip-heuristic', None)

        return None

    def _has_known_extension(self, name: str) -> bool:
        """Return True if name ends with a known extension from COMMON_EXTENSIONS."""
        base = name.rsplit('/', 1)[-1].lower()
        return any(base.endswith(ext) for ext in self.COMMON_EXTENSIONS)

    def _existing_extension(self, name: str) -> Optional[str]:
        """Return the suffix found in name (e.g., '.pdf') if present and plausible; else None.
        Plausible = dot + 2~6 alnum chars (covers most common cases like .pdf/.pptx/.mpeg etc.).
        """
        try:
            ext = Path(name).suffix
        except Exception:
            ext = ''
        ext = (ext or '').strip().lower()
        if ext and 2 <= len(ext) <= 6 and re.fullmatch(r'\.[a-z0-9]+', ext):
            return ext
        return None

    def _filename_from_headers(self, content_disp: Optional[str]) -> Optional[str]:
        """Extract filename from Content-Disposition header if present."""
        if not content_disp:
            return None
        try:
            match = re.search(r"filename\*=utf-8''([^;]+)", content_disp, re.IGNORECASE)
            if match:
                return unquote(match.group(1))
            match = re.search(r'filename=([^;]+)', content_disp, re.IGNORECASE)
            if match:
                return unquote(match.group(1).strip('"\''))
        except Exception:
            pass
        return None

    @staticmethod
    def _decode_jwt_payload(token: str) -> Optional[Dict]:
        """Decode JWT payload without signature verification."""
        try:
            parts = token.split('.')
            if len(parts) < 2:
                return None
            payload_b64 = parts[1]
            payload_b64 += '=' * (-len(payload_b64) % 4)
            payload = base64.urlsafe_b64decode(payload_b64.encode('utf-8'))
            return json.loads(payload.decode('utf-8'))
        except Exception:
            return None

    def _extract_hqy_course_id_from_playvideo_href(self, href: str) -> Optional[str]:
        """Extract hqyCourseId from playVideo.action JWT token URL."""
        try:
            parsed = urlparse(href)
            query = parse_qs(parsed.query)
            token_values = query.get('token', [])
            if not token_values:
                match = re.search(r'token=([^&]+)', href)
                if not match:
                    return None
                token_values = [match.group(1)]

            token = unquote(token_values[0])
            payload = self._decode_jwt_payload(token)
            if not payload:
                return None

            hqy_course_id = payload.get('hqyCourseId')
            if hqy_course_id is None:
                return None
            return str(hqy_course_id)
        except Exception:
            return None
    
    def __init__(self, session: requests.Session, config):
        self.session = session
        self.config = config
        self.stats = {'downloaded': 0, 'skipped': 0, 'failed': 0}

        # Sync report tracking
        self.sync_id = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        self.started_at = datetime.now()
        self.file_records = {
            'downloaded': [],
            'skipped': [],
            'failed': []
        }

        # Track current course directory for relative path recording
        self.current_course_dir = None

        # Ensure reports directory exists
        config_dir = Path(config.config_path).parent if hasattr(config, 'config_path') else Path.home() / '.pku_downloader'
        self.reports_dir = config_dir / 'reports'
        self.reports_dir.mkdir(parents=True, exist_ok=True)

        # Stop/Pause control
        self._stop_event = threading.Event()
        self._pause_event = threading.Event()
        self._pause_event.set()  # Start in running state (set = not paused)

        # Progress tracking
        self.progress = {
            'phase': 'idle',
            'total_courses': 0,
            'current_course_index': 0,
            'current_course_name': '',
            'course_files_total': 0,
            'course_files_done': 0,
            'current_file_name': '',
            'current_file_progress': 0.0,
            'current_file_size': 0,
            'current_file_downloaded': 0,
            'bytes_downloaded': 0,   # cumulative bytes written this course batch
            'bytes_expected': 0      # cumulative bytes expected this course batch
        }
        self._progress_lock = threading.Lock()
        self.last_progress_update = 0
        self.window = None  # Will be set by gui.py

    def _parse_tabs_from_soup(self, soup: BeautifulSoup, base_url: str, course: Dict) -> List[Dict]:
        """Extract course navigation tabs from an already-fetched BeautifulSoup object."""
        menu = soup.find('ul', id='courseMenuPalette_contents')
        if not menu:
            return []
        areas = []
        for link in menu.find_all('a'):
            name = link.text.strip()
            url = link.get('href')
            if not url or url.startswith('#') or url.startswith('javascript:'):
                continue
            areas.append({
                'name': name,
                'url': urljoin(base_url, url),
                'flatten': course.get('flatten', True)
            })
        return areas

    def get_course_tabs(self, course: Dict) -> List[Dict]:
        """Fetch available tabs for a single course without downloading content."""
        course_url = course.get('url')
        if not course_url:
            return []
        try:
            response = self.session.get(course_url, timeout=20)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            return self._parse_tabs_from_soup(soup, response.url, course)
        except Exception as e:
            logger.error(f"Failed to fetch tabs for {course.get('name')}: {e}")
            return []

    def _emit_progress(self):
        """Emit progress update to frontend (throttled to 100ms)"""
        now = time.time()
        if now - self.last_progress_update < 0.1:  # 100ms throttle
            return

        self.last_progress_update = now

        if self.window:
            try:
                progress_data = {
                    **self.progress,
                    'stats': self.stats.copy()
                }
                self.window.evaluate_js(
                    f"if(window.updateProgress) window.updateProgress({json.dumps(progress_data)})"
                )
            except Exception as e:
                logger.debug(f"Failed to emit progress: {e}")

    def _increment_files_done(self):
        """Thread-safe increment of course_files_done."""
        with self._progress_lock:
            self.progress['course_files_done'] += 1

    def stop(self):
        """Request download stop."""
        self._stop_event.set()
        self._pause_event.set()  # Unpause to let threads exit

    def pause(self):
        """Pause the download."""
        self._pause_event.clear()
        self.progress['phase'] = 'paused'
        self._emit_progress()

    def resume(self):
        """Resume the download."""
        self._pause_event.set()
        self.progress['phase'] = 'downloading'
        self._emit_progress()

    @property
    def is_paused(self):
        return not self._pause_event.is_set()

    @property
    def is_stopped(self):
        return self._stop_event.is_set()

    def _check_stop(self):
        """Check if stop requested. Blocks while paused. Returns True if should stop."""
        if self._stop_event.is_set():
            return True
        self._pause_event.wait()  # Blocks if paused
        return self._stop_event.is_set()

    def _discover_replay_id_from_soup(self, soup: BeautifulSoup, base_url: str, course: Dict) -> Optional[str]:
        """Discover replay course_id from an already-fetched course page soup.
        Returns the replay course_id string or None.
        Set PKU_REPLAY_DEBUG=1 for verbose per-link logging."""
        menu = soup.find('ul', id='courseMenuPalette_contents')
        if not menu:
            logger.debug(f"  [replay] No courseMenuPalette_contents found for {course.get('name')}")
            return None

        if REPLAY_DEBUG:
            all_links = [f"    '{link.text.strip()}' -> {link.get('href', '')}" for link in menu.find_all('a')]
            logger.info(f"  [replay] Menu links for {course.get('name')}:\n" + "\n".join(all_links))

        for link in menu.find_all('a'):
            href = link.get('href', '')
            text = link.text.strip()

            href_match = any(kw in href for kw in ['playVideo', 'bb-streammedia', 'streammedia'])
            text_match = any(kw in text for kw in ['录播', '回放', '视频', '课堂实录', '在线课堂'])

            if href_match or text_match:
                full_url = urljoin(base_url, href)
                if REPLAY_DEBUG:
                    logger.info(f"  [replay] Following potential replay link: '{text}' -> {full_url}")
                try:
                    video_page = self.session.get(full_url, timeout=20)
                    video_soup = BeautifulSoup(video_page.text, 'html.parser')

                    if REPLAY_DEBUG:
                        title_tag = video_soup.find('title')
                        logger.info(f"  [replay] Page title: {title_tag.text.strip() if title_tag else 'N/A'}")
                        for dbg_iframe in video_soup.find_all('iframe'):
                            logger.info(f"  [replay] iframe src: {dbg_iframe.get('src', '')}")

                    # Preferred path: onlineroomse player contains explicit course_id.
                    iframe = video_soup.find('iframe', src=re.compile(r'onlineroomse\.pku\.edu\.cn'))
                    if iframe:
                        src = iframe['src']
                        match = re.search(r'course_id=(\d+)', src)
                        if match:
                            logger.info(f"  [replay] Found replay for {course.get('name')}: course_id={match.group(1)}")
                            return match.group(1)

                    # Also check for onlineroomse links in <a> tags
                    for a_tag in video_soup.find_all('a', href=re.compile(r'onlineroomse\.pku\.edu\.cn')):
                        href_inner = a_tag.get('href', '')
                        match = re.search(r'course_id=(\d+)', href_inner)
                        if match:
                            logger.info(f"  [replay] Found replay link in <a>: course_id={match.group(1)}")
                            return match.group(1)

                    # Check page text/scripts for onlineroomse URLs
                    page_text = video_page.text
                    matches = re.findall(r'onlineroomse\.pku\.edu\.cn[^"\'>\s]*course_id=(\d+)', page_text)
                    if matches:
                        logger.info(f"  [replay] Found replay in page source: course_id={matches[0]}")
                        return matches[0]

                    # Fallback path: streammedia "观看" links carry JWT token with hqyCourseId.
                    for a_tag in video_soup.find_all('a'):
                        href_inner = a_tag.get('href', '')
                        if 'playVideo.action' not in href_inner or 'token=' not in href_inner:
                            continue
                        hqy_course_id = self._extract_hqy_course_id_from_playvideo_href(href_inner)
                        if hqy_course_id:
                            logger.info(
                                f"  [replay] Found replay via playVideo token for "
                                f"{course.get('name')}: hqyCourseId={hqy_course_id}"
                            )
                            return hqy_course_id

                    token_pattern = r'playVideo\.action\?[^"\'>\s]*token=([A-Za-z0-9._%\-]+)'
                    for token_encoded in re.findall(token_pattern, page_text):
                        payload = self._decode_jwt_payload(unquote(token_encoded))
                        hqy_course_id = payload.get('hqyCourseId') if payload else None
                        if hqy_course_id is not None:
                            logger.info(
                                f"  [replay] Found replay via token in page source for "
                                f"{course.get('name')}: hqyCourseId={hqy_course_id}"
                            )
                            return str(hqy_course_id)

                    logger.debug(f"  [replay] No replay course_id/hqyCourseId found on this page")

                except Exception as e:
                    logger.debug(f"  [replay] Error following replay link: {e}")
                    continue

        return None

    def discover_replay_id(self, course: Dict) -> Optional[str]:
        """Check if a course has replay videos. Returns the replay course_id or None."""
        course_url = course.get('url')
        if not course_url:
            return None
        try:
            response = self.session.get(course_url, timeout=20)
            soup = BeautifulSoup(response.text, 'html.parser')
            return self._discover_replay_id_from_soup(soup, response.url, course)
        except Exception as e:
            logger.error(f"Failed to discover replay for {course.get('name')}: {e}")
            return None

    def fetch_metadata(self, courses: List[Dict], skip_if_cached: bool = False) -> List[Dict]:
        """
        Parallel fetch of metadata (tabs + replay info) for all courses.
        Each course page is fetched only once – tab discovery and replay detection
        share the same HTTP response, halving the number of outbound requests.

        If skip_if_cached=True, courses that already have 'available_tabs' populated
        are returned as-is with no network request at all.
        """
        logger.info("Fetching course metadata...")

        def _enrich_course(course):
            c_copy = course.copy()

            # Skip network fetch if caller pre-populated metadata from cache
            if skip_if_cached and c_copy.get('available_tabs'):
                c_copy.setdefault('replay_course_id', '')
                c_copy['has_replay'] = bool(c_copy.get('replay_course_id'))
                return c_copy

            course_url = c_copy.get('url')
            if not course_url:
                c_copy.setdefault('available_tabs', [])
                c_copy.setdefault('replay_course_id', '')
                c_copy.setdefault('has_replay', False)
                return c_copy

            # Single HTTP request – reused for both tab discovery and replay detection
            try:
                response = self.session.get(course_url, timeout=20)
                response.raise_for_status()
                soup = BeautifulSoup(response.text, 'html.parser')
            except Exception as e:
                logger.error(f"Failed to fetch page for {c_copy.get('name')}: {e}")
                c_copy.setdefault('available_tabs', [])
                c_copy.setdefault('replay_course_id', '')
                c_copy.setdefault('has_replay', False)
                return c_copy

            tabs = self._parse_tabs_from_soup(soup, response.url, c_copy)
            c_copy['tabs'] = tabs
            c_copy['available_tabs'] = [t['name'] for t in tabs]

            replay_id = self._discover_replay_id_from_soup(soup, response.url, c_copy)
            c_copy['replay_course_id'] = replay_id or ''
            c_copy['has_replay'] = bool(replay_id)

            return c_copy

        enriched_courses = []
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = {executor.submit(_enrich_course, c): c for c in courses}
            for future in as_completed(futures):
                try:
                    enriched_courses.append(future.result())
                except Exception as e:
                    logger.error(f"Error enriching course: {e}")
                    enriched_courses.append(futures[future])  # fall back to original

        return enriched_courses
    
    def download_courses(self, courses: List[Dict]):
        """Download content from multiple courses."""
        self.current_course_name = None  # Track current course for error reporting
        self.current_course_id = None  # Track current course ID for reports
        self.progress['total_courses'] = len(courses)
        self.progress['phase'] = 'downloading'
        self._emit_progress()

        try:
            for idx, course in enumerate(courses):
                if self._check_stop():
                    logger.info("Download stopped by user.")
                    break
                self.progress['current_course_index'] = idx + 1
                self.download_course(course)
        finally:
            # Always generate report, even if interrupted
            self.progress['phase'] = 'complete'
            self._emit_progress()
            self.generate_report()

    def download_course(self, course: Dict):
        """Download all content from a course."""
        course_id = course.get('id', 'unknown')
        raw_name = course.get('alias') or course.get('name', f'Course_{course_id}')
        course_name = self._sanitize_name(raw_name)
        self.current_course_name = course_name  # Track for error reporting
        self.current_course_id = course_id  # Track for reports

        # Create course directory and track it for relative path recording
        course_dir = Path(self.config.get('download_dir')) / course_name
        course_dir.mkdir(parents=True, exist_ok=True)
        self.current_course_dir = course_dir

        # Update progress
        self.progress['current_course_name'] = course_name
        self.progress['course_files_done'] = 0
        self.progress['course_files_total'] = 0  # Will be updated as we discover files
        self._emit_progress()

        course_url = course.get('url')

        if not course_url:
            logger.warning(f"No URL for course {course_name}")
            return

        logger.info(f"\n=== Downloading: {course_name} ===")

        # Get course page and find content areas
        try:
            # 🔑 使用已有的 tabs 数据（来自 fetch_metadata）
            # 如果没有，才重新获取
            if 'tabs' in course and course['tabs']:
                content_areas = course['tabs']
            else:
                content_areas = self.get_course_tabs(course)

            if not content_areas:
                logger.warning(f"No content areas found for {course_name}")
                return

            # 🔑 根据 selected_tabs 过滤要下载的区域
            selected_tabs = course.get('selected_tabs', [])

            if selected_tabs:
                # 用户有明确选择 - 只处理选中的标签页
                filtered_areas = [area for area in content_areas if area['name'] in selected_tabs]
                if filtered_areas:
                    logger.info(f"  Selected tabs: {', '.join(selected_tabs)}")
                    content_areas = filtered_areas
                else:
                    logger.warning(f"No matching tabs found for selected: {selected_tabs}")
                    return
            else:
                # 用户没有选择任何标签页 - 跳过下载
                logger.info(f"  No tabs selected, skipping download")
                return

            # Phase 1: Scan all content areas to discover files
            self.progress['phase'] = 'scanning'
            self._emit_progress()

            all_files = []
            for area in content_areas:
                if self._check_stop():
                    return
                area_name = self._sanitize_name(area['name'])
                if area.get('flatten'):
                    area_dir = course_dir
                else:
                    area_dir = course_dir / area_name
                    area_dir.mkdir(parents=True, exist_ok=True)

                logger.info(f"\n  Scanning: {area_name}")
                all_files.extend(self._scan_content_area(area['url'], area_dir))

            if not all_files:
                logger.info(f"  No files found for {course_name}")
                return

            # Phase 2: Download all discovered files
            self.progress['phase'] = 'downloading'
            self.progress['course_files_total'] = len(all_files)
            self.progress['course_files_done'] = 0
            self.progress['bytes_downloaded'] = 0
            self.progress['bytes_expected'] = 0
            self._emit_progress()

            logger.info(f"  Found {len(all_files)} files, starting download...")

            max_workers = self.config.getint('concurrent_downloads', 3)
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = []
                for url, file_path, link_text in all_files:
                    if self._stop_event.is_set():
                        break
                    future = executor.submit(self._download_file, url, file_path, link_text)
                    futures.append(future)

                # On stop, cancel pending futures
                if self._stop_event.is_set():
                    for future in futures:
                        future.cancel()
                    return

                # Wait for downloads to complete
                for future in as_completed(futures):
                    try:
                        future.result()
                    except Exception as e:
                        logger.debug(f"      Download error: {e}")

        except requests.RequestException as e:
            logger.error(f"Network error processing course {course_name}: {e}")
        except Exception as e:
            logger.error(f"Failed to process course {course_name}: {e}")
    
    def _find_content_areas(self, menu, base_url: str, course: Dict) -> List[Dict]:
        """Find content areas to download from."""
        areas = []
        download_all = self.config.getbool('download_all_areas')
        target_areas = set()

        course_sections = course.get('sections')
        course_sections_set = set(course_sections) if course_sections else set()

        if course_sections and '*' in course_sections:
            download_all = True
        elif course_sections_set:
            target_areas = course_sections_set
        elif not download_all:
            locations = self.config.get('default_content_locations', '教学内容')
            target_areas = {name.strip() for name in locations.split(',') if name.strip()}

        for link in menu.find_all('a'):
            name = link.text.strip()
            url = link.get('href')

            if not url or url.startswith('#') or url.startswith('javascript:'):
                continue

            if download_all or name in target_areas:
                areas.append({
                    'name': name,
                    'url': urljoin(base_url, url),
                    'flatten': course.get('flatten', True)
                })

        return areas
    
    def _process_content_area(self, url: str, local_dir: Path):
        """Process a content area (handles pagination)."""
        current_url = url
        processed_folders = set()
        
        while current_url:
            if self._stop_event.is_set():
                return
            try:
                response = self.session.get(current_url, timeout=30)
                response.raise_for_status()
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Find content list
                content_list = soup.find('ul', id='content_listContainer')
                if not content_list:
                    content_list = soup.select_one('div.container-fluid ul.listElement')
                
                if content_list:
                    self._process_content_list(content_list, response.url, local_dir, processed_folders)
                
                # Check for next page
                next_link = soup.find('a', title='下一页')
                if next_link and next_link.get('href'):
                    next_url = urljoin(response.url, next_link['href'])
                    if next_url != current_url:
                        current_url = next_url
                        time.sleep(0.5)  # Be nice to the server
                    else:
                        current_url = None
                else:
                    current_url = None

            except requests.RequestException as e:
                logger.error(f"    Network error processing content area: {e}")
                current_url = None
            except Exception as e:
                logger.error(f"    Error processing content area: {e}")
                current_url = None
    
    def _process_content_list(self, content_list, base_url: str, local_dir: Path, processed_folders: set):
        """Process links in content list."""
        links = content_list.find_all('a', href=True)

        # Use thread pool for concurrent downloads
        max_workers = self.config.getint('concurrent_downloads', 3)
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = []

            for link in links:
                if self._stop_event.is_set():
                    break

                href = link.get('href', '')
                text = link.text.strip()

                if not href or href.startswith('#') or href.startswith('javascript:'):
                    continue

                full_url = urljoin(base_url, href)

                # Check if it's a folder
                if self._is_folder(link, href):
                    folder_name = self._sanitize_name(text or "Unnamed_Folder")
                    if full_url not in processed_folders:
                        processed_folders.add(full_url)
                        folder_dir = local_dir / folder_name
                        folder_dir.mkdir(parents=True, exist_ok=True)
                        # Recursively process folder
                        self._process_content_area(full_url, folder_dir)
                    continue

                # Check if it's a file
                if self._is_file(link, href, text):
                    filename = self._extract_filename(href, text)
                    if filename:
                        file_path = local_dir / filename
                        future = executor.submit(self._download_file, full_url, file_path, text)
                        futures.append(future)

            # On stop, cancel pending futures
            if self._stop_event.is_set():
                for future in futures:
                    future.cancel()
                return

            # Wait for downloads to complete
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    logger.debug(f"      Download error: {e}")
    
    def _scan_content_area(self, url: str, local_dir: Path) -> List[Tuple[str, Path, str]]:
        """Scan a content area and return list of (url, file_path, link_text) without downloading."""
        results = []
        current_url = url
        processed_folders = set()

        while current_url:
            if self._stop_event.is_set():
                return results
            try:
                response = self.session.get(current_url, timeout=30)
                response.raise_for_status()
                soup = BeautifulSoup(response.text, 'html.parser')

                content_list = soup.find('ul', id='content_listContainer')
                if not content_list:
                    content_list = soup.select_one('div.container-fluid ul.listElement')

                if content_list:
                    results.extend(self._scan_content_list(content_list, response.url, local_dir, processed_folders))

                # Check for next page
                next_link = soup.find('a', title='下一页')
                if next_link and next_link.get('href'):
                    next_url = urljoin(response.url, next_link['href'])
                    if next_url != current_url:
                        current_url = next_url
                        time.sleep(0.5)
                    else:
                        current_url = None
                else:
                    current_url = None

            except requests.RequestException as e:
                logger.error(f"    Network error scanning content area: {e}")
                current_url = None
            except Exception as e:
                logger.error(f"    Error scanning content area: {e}")
                current_url = None

        return results

    def _scan_content_list(self, content_list, base_url: str, local_dir: Path, processed_folders: set) -> List[Tuple[str, Path, str]]:
        """Scan links in content list and return file info tuples without downloading."""
        results = []
        links = content_list.find_all('a', href=True)

        for link in links:
            if self._stop_event.is_set():
                break

            href = link.get('href', '')
            text = link.text.strip()

            if not href or href.startswith('#') or href.startswith('javascript:'):
                continue

            full_url = urljoin(base_url, href)

            # Check if it's a folder
            if self._is_folder(link, href):
                folder_name = self._sanitize_name(text or "Unnamed_Folder")
                if full_url not in processed_folders:
                    processed_folders.add(full_url)
                    folder_dir = local_dir / folder_name
                    folder_dir.mkdir(parents=True, exist_ok=True)
                    # Recursively scan folder
                    results.extend(self._scan_content_area(full_url, folder_dir))
                continue

            # Check if it's a file
            if self._is_file(link, href, text):
                filename = self._extract_filename(href, text)
                if filename:
                    file_path = local_dir / filename
                    results.append((full_url, file_path, text))

        return results

    def _is_folder(self, link, href: str) -> bool:
        """Check if link is a folder."""
        if 'listContent.jsp' in href or 'listContentEditable.jsp' in href:
            return True
        
        parent_li = link.find_parent('li')
        if parent_li:
            classes = parent_li.get('class', [])
            if 'folder' in classes:
                return True
            
            img = parent_li.find('img')
            if img and 'folder' in img.get('src', '').lower():
                return True
        
        return False
    
    def _is_file(self, link, href: str, text: str) -> bool:
        """Check if link is a downloadable file."""
        # Direct file links
        if '/bbcswebdav/' in href:
            return True
        
        # Check extensions
        href_lower = href.lower().split('?')[0]
        if any(href_lower.endswith(ext) for ext in self.COMMON_EXTENSIONS):
            return True
        
        # Check text for extensions
        if text and any(text.lower().endswith(ext) for ext in self.COMMON_EXTENSIONS):
            return True
        
        # Download links
        if any(marker in href for marker in ['download', 'attachFile', 'downloadFile']):
            return True
        
        return False
    
    def _extract_filename(self, href: str, text: str) -> str:
        """Extract filename from URL or text."""
        filename = None

        # 1) Prefer link text as the displayed/download name
        if text and text.strip():
            filename = text.strip()

        # 2) If no usable text, try to get from URL path
        if not filename:
            if '/bbcswebdav/' in href:
                try:
                    path_part = href.split('/bbcswebdav/', 1)[1].split('?')[0]
                    filename = unquote(path_part.split('/')[-1])
                except Exception:
                    pass

        # 3) If still not found, use URL tail
        if not filename:
            try:
                filename = unquote(href.split('/')[-1].split('?')[0])
            except Exception:
                pass

        # 4) Generate fallback name
        if not filename:
            filename = f"download_{int(time.time()*1000)}"

        return self._sanitize_name(filename)
    
    def _download_file(self, url: str, file_path: Path, link_text: Optional[str] = None) -> bool:
        """Download a single file."""
        # Check stop before starting
        if self._check_stop():
            return False

        # Update progress - starting new file
        self.progress['current_file_name'] = link_text or file_path.name
        self.progress['current_file_progress'] = 0.0
        self._emit_progress()

        # Determine overwrite behavior and preflight HEAD
        overwrite_mode = self.config.get('overwrite', 'size')
        remote_size = -1
        head_ct = None
        try:
            head_resp = self.session.head(url, timeout=10, allow_redirects=True)
            remote_size = int(head_resp.headers.get('Content-Length', -1))
            head_ct = head_resp.headers.get('Content-Type')
            if remote_size > 0:
                with self._progress_lock:
                    self.progress['bytes_expected'] += remote_size
        except Exception:
            pass

        # Always prefer link text as the base name for saving
        base_name = self._sanitize_name(link_text) if link_text else file_path.stem
        existing_ext = self._existing_extension(base_name)

        # If text has an extension, DO NOT infer/append here; keep the text as-is.
        if existing_ext:
            tentative_name = base_name
        else:
            # If text has no extension, try to infer from HEAD Content-Type
            if head_ct and head_ct != 'application/octet-stream':
                ext_from_head = mimetypes.guess_extension(head_ct.split(';', 1)[0].strip())
                if not ext_from_head and head_ct.startswith('image/jpeg'):
                    ext_from_head = '.jpg'
            else:
                ext_from_head = None
            tentative_name = base_name + (ext_from_head or '')
        file_path = file_path.with_name(tentative_name)

        # Overwrite/skip decision using preflight info
        if file_path.exists():
            if overwrite_mode == 'never':
                self.stats['skipped'] += 1
                self._increment_files_done()
                skip_size = remote_size if remote_size > 0 else (file_path.stat().st_size if file_path.exists() else 0)
                if skip_size > 0:
                    with self._progress_lock:
                        self.progress['bytes_downloaded'] += skip_size
                self._record_file('skipped', file_path.name, reason='already_exists', file_path=file_path)
                self._emit_progress()
                return False
            elif overwrite_mode == 'size' and remote_size > -1:
                try:
                    if file_path.stat().st_size == remote_size:
                        self.stats['skipped'] += 1
                        self._increment_files_done()
                        with self._progress_lock:
                            self.progress['bytes_downloaded'] += remote_size
                        logger.info(f"      [SKIP] (same size): {file_path.name}")
                        self._record_file('skipped', file_path.name, reason='same_size', size=remote_size, file_path=file_path)
                        self._emit_progress()
                        return False
                except Exception:
                    pass

        # Download the file
        try:
            file_path.parent.mkdir(parents=True, exist_ok=True)

            response = self.session.get(url, stream=True, timeout=180)
            response.raise_for_status()

            # Possibly refine filename using headers first
            content_disp = response.headers.get('content-disposition')
            header_name = self._filename_from_headers(content_disp)
            if header_name:
                file_path = file_path.with_name(self._sanitize_name(header_name))

            # Get actual file size from response
            total_size = int(response.headers.get('Content-Length', 0))
            downloaded = 0

            # Read first chunk to sniff content (but also write it later)
            iterator = response.iter_content(chunk_size=8192)
            try:
                first_chunk = next(iterator)
            except StopIteration:
                first_chunk = b''

            # If and only if the original link text lacked an extension, try to choose a better extension
            text_has_ext = bool(self._existing_extension(link_text or ''))
            if not text_has_ext:
                chosen = self._choose_extension(file_path.name, response.headers.get('Content-Type'), first_chunk)
                if chosen:
                    ext, source, mime = chosen
                    detail = f" MIME={mime}" if mime else ""
                    logger.debug(f"      [infer] '{link_text or file_path.stem}' -> add {ext} via {source}.{detail}")
                    stem = file_path.stem
                    new_path = file_path.with_name(self._sanitize_name(stem + ext))

                    # If the final-target file already exists and matches remote size, skip
                    try:
                        resp_size = int(response.headers.get('Content-Length', -1))
                    except Exception:
                        resp_size = -1
                    if new_path.exists() and resp_size > -1:
                        try:
                            if new_path.stat().st_size == resp_size:
                                self.stats['skipped'] += 1
                                self._increment_files_done()
                                with self._progress_lock:
                                    self.progress['bytes_downloaded'] += resp_size
                                logger.info(f"      [SKIP] (same size): {new_path.name}")
                                self._record_file('skipped', new_path.name, reason='same_size', size=resp_size, file_path=new_path)
                                self._emit_progress()
                                return True
                        except Exception:
                            pass

                    file_path = new_path

            # Write file (including the sniffed first chunk)
            stopped_during_write = False
            with open(file_path, 'wb') as f:
                if first_chunk:
                    f.write(first_chunk)
                    downloaded += len(first_chunk)
                    with self._progress_lock:
                        self.progress['bytes_downloaded'] += len(first_chunk)
                    if total_size > 0:
                        self.progress['current_file_progress'] = downloaded / total_size
                    self._emit_progress()

                for chunk in iterator:
                    if self._stop_event.is_set():
                        stopped_during_write = True
                        break
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        with self._progress_lock:
                            self.progress['bytes_downloaded'] += len(chunk)

                        # Update progress
                        if total_size > 0:
                            self.progress['current_file_progress'] = downloaded / total_size
                        self._emit_progress()

            # Clean up partial file on stop
            if stopped_during_write:
                try:
                    if file_path.exists():
                        file_path.unlink()
                        logger.info(f"      [STOP] Removed partial: {file_path.name}")
                except Exception:
                    pass
                return False

            logger.info(f"      [OK] {file_path.name}")
            self.stats['downloaded'] += 1
            self._increment_files_done()
            final_size = file_path.stat().st_size
            self._record_file('downloaded', file_path.name, size=final_size, url=url, file_path=file_path)
            self._emit_progress()
            return True

        except requests.RequestException as e:
            logger.warning(f"      [FAIL] {file_path.name}: {str(e)[:50]}")
            self.stats['failed'] += 1
            self._increment_files_done()
            self._record_file('failed', file_path.name, error=str(e), error_type='NetworkError', file_path=file_path)
            self._emit_progress()

            # Clean up partial download
            if file_path.exists() and file_path.stat().st_size == 0:
                file_path.unlink()

            return False
        except Exception as e:
            logger.error(f"      [FAIL] {file_path.name}: {str(e)[:50]}")
            self.stats['failed'] += 1
            self._increment_files_done()
            self._record_file('failed', file_path.name, error=str(e), error_type='UnknownError', traceback=traceback.format_exc(), file_path=file_path)
            self._emit_progress()

            # Clean up partial download
            if file_path.exists() and file_path.stat().st_size == 0:
                file_path.unlink()

            return False
    
    def _parse_content_disposition(self, content_disp: str) -> Optional[str]:
        """Parse filename from Content-Disposition header.
        (Kept for backward-compatibility; new code uses _filename_from_headers.)
        """
        try:
            # Try UTF-8 encoded filename
            match = re.search(r"filename\*=utf-8''([^;]+)", content_disp, re.IGNORECASE)
            if match:
                return unquote(match.group(1))
            
            # Try regular filename
            match = re.search(r'filename=([^;]+)', content_disp, re.IGNORECASE)
            if match:
                filename = match.group(1).strip('"\'')
                return unquote(filename)
        except Exception:
            pass
        
        return None
    
    def _sanitize_name(self, name: str) -> str:
        """Make a name safe for filesystem."""
        # Remove invalid characters
        name = re.sub(r'[\\/*?:"<>|\r\n]+', '', name)
        name = name.strip('. ')
        
        # Ensure non-empty
        if not name:
            name = f"unnamed_{int(time.time()*1000)}"
        
        # Truncate if too long
        if len(name) > 200:
            name = name[:200]
        
        return name
    
    def download_replays(self, course: Dict, replays: List[Dict]):
        """Download replay videos for a course.

        Args:
            course: Course dict with name, alias, etc.
            replays: List of replay dicts (from replay.parse_replay_list),
                     filtered to only those the user selected.
        """
        raw_name = course.get('alias') or course.get('name', 'Unknown')
        course_name = self._sanitize_name(raw_name)
        self.current_course_name = course_name
        self.current_course_id = course.get('id', 'unknown')

        replay_dir = Path(self.config.get('download_dir')) / course_name / '_录播回放'
        replay_dir.mkdir(parents=True, exist_ok=True)
        self.current_course_dir = replay_dir.parent

        self.progress['current_course_name'] = f"{course_name} (录播)"
        self.progress['course_files_total'] = len(replays)
        self.progress['course_files_done'] = 0
        self.progress['phase'] = 'downloading'
        self._emit_progress()

        logger.info(f"\n=== Downloading replays: {course_name} ({len(replays)} videos) ===")

        def _normalize(v):
            return str(v or '').strip()

        def _build_replay_lookup(items: List[Dict]):
            by_id = {}
            by_full_meta = {}
            by_sub_title = {}
            for item in items or []:
                replay_id = _normalize(item.get('replay_id'))
                if replay_id:
                    by_id[replay_id] = item
                sub_title = _normalize(item.get('sub_title'))
                lecturer_name = _normalize(item.get('lecturer_name'))
                title = _normalize(item.get('title'))
                if sub_title:
                    by_sub_title[sub_title] = item
                by_full_meta[(sub_title, lecturer_name, title)] = item
            return by_id, by_full_meta, by_sub_title

        def _match_replay(lookup_tuple, replay_dict):
            by_id, by_full_meta, by_sub_title = lookup_tuple
            replay_id = _normalize(replay_dict.get('replay_id'))
            item = by_id.get(replay_id) if replay_id else None
            if not item:
                item = by_full_meta.get((
                    _normalize(replay_dict.get('sub_title')),
                    _normalize(replay_dict.get('lecturer_name')),
                    _normalize(replay_dict.get('title')),
                ))
            if not item:
                item = by_sub_title.get(_normalize(replay_dict.get('sub_title')))
            return item

        def _inject_session_cookies(driver):
            """Inject session cookies (iaaa + course.pku.edu.cn) into a Selenium browser."""
            iaaa_cookies = [c for c in self.session.cookies if 'iaaa' in (c.domain or '')]
            if iaaa_cookies:
                logger.info("  [REPLAY] Injecting iaaa SSO cookies into browser...")
                driver.get('https://iaaa.pku.edu.cn')
                for c in iaaa_cookies:
                    try:
                        driver.add_cookie({
                            'name': c.name,
                            'value': c.value,
                            'domain': c.domain or 'iaaa.pku.edu.cn',
                            'path': c.path or '/'
                        })
                    except Exception:
                        continue
            else:
                logger.warning("  [REPLAY] No iaaa cookies found in session — SSO may fail.")
            driver.get('https://course.pku.edu.cn')
            for c in self.session.cookies:
                if 'iaaa' in (c.domain or ''):
                    continue
                try:
                    driver.add_cookie({
                        'name': c.name,
                        'value': c.value,
                        'domain': c.domain or '.pku.edu.cn',
                        'path': c.path or '/'
                    })
                except Exception:
                    continue

        def _resolve_all_unresolved_via_selenium(replays_list: List[Dict]):
            """Open ONE browser, resolve all playVideo token URLs to real download URLs.

            Navigates to each replay's token URL individually using the same driver so
            cookies are only injected once and the browser is only opened once.
            The XHR interceptor is registered via CDP Page.addScriptToEvaluateOnNewDocument
            once; it fires automatically before page JS on every subsequent navigation.
            """
            from ..browser import get_driver
            from ..replay import XHR_INTERCEPTOR_JS, parse_replay_list, extract_jwt_from_play_url

            logger.info(
                f"  [REPLAY] Opening browser to resolve {len(replays_list)} URL(s) "
                f"(one navigation per video, same browser instance)..."
            )
            browser = self.config.get('browser')
            headless = self.config.getbool('headless', False)
            driver = get_driver(browser=browser, headless=headless)
            try:
                _inject_session_cookies(driver)

                # Register CDP XHR interceptor ONCE — fires before any page JS on
                # every subsequent navigation, eliminating the race condition.
                try:
                    driver.execute_cdp_cmd(
                        "Page.addScriptToEvaluateOnNewDocument",
                        {"source": XHR_INTERCEPTOR_JS}
                    )
                    logger.debug("  [REPLAY] XHR interceptor registered via CDP")
                except Exception as _cdp_err:
                    logger.warning(f"  [REPLAY] CDP registration failed: {_cdp_err}")

                total = len(replays_list)
                for idx, replay in enumerate(replays_list, 1):
                    play_url = str(replay.get('download_url', ''))
                    if not play_url:
                        continue

                    jwt_token = extract_jwt_from_play_url(play_url)
                    logger.info(
                        f"  [REPLAY] [{idx}/{total}] {replay.get('filename', play_url[:60])}"
                    )

                    try:
                        driver.get(play_url)
                    except Exception as _nav_err:
                        logger.warning(f"    [REPLAY] Navigation failed: {_nav_err}")
                        continue

                    # Poll for XHR capture (max 60s per video).
                    max_wait = 60
                    poll_start = time.time()
                    last_log = poll_start
                    data = None
                    while time.time() - poll_start < max_wait:
                        try:
                            data = driver.execute_script(
                                "return window.__PKU_GET_REPLAY_DATA;"
                            )
                        except Exception:
                            time.sleep(0.5)
                            continue
                        if data:
                            break
                        if time.time() - last_log >= 10:
                            try:
                                logger.debug(
                                    f"    [REPLAY] Waiting... "
                                    f"{int(time.time() - poll_start)}s, "
                                    f"URL: {driver.current_url[:80]}"
                                )
                            except Exception:
                                pass
                            last_log = time.time()
                        time.sleep(0.5)

                    if not data:
                        logger.warning(
                            f"    [REPLAY] Timed out: {replay.get('filename', '')}"
                        )
                        continue

                    fresh_entries = parse_replay_list(data)
                    if not fresh_entries:
                        logger.warning(
                            f"    [REPLAY] No parseable data: {replay.get('filename', '')}"
                        )
                        continue

                    # Match by hqySubId from JWT, then sub_title, then first entry.
                    sub_id = ''
                    if jwt_token:
                        payload = self._decode_jwt_payload(jwt_token)
                        if payload:
                            sub_id = str(payload.get('hqySubId', '')).strip()

                    matched = None
                    if sub_id:
                        matched = next(
                            (r for r in fresh_entries
                             if str(r.get('replay_id', '')) == sub_id),
                            None
                        )
                    if not matched:
                        matched = next(
                            (r for r in fresh_entries
                             if _normalize(r.get('sub_title'))
                             == _normalize(replay.get('sub_title'))),
                            None
                        )
                    if not matched:
                        matched = fresh_entries[0]

                    resolved = _normalize(matched.get('download_url')) if matched else ''
                    if resolved:
                        replay['download_url'] = resolved
                        logger.debug(f"    [REPLAY] ✓ {replay.get('filename', '')}")
                    else:
                        logger.warning(
                            f"    [REPLAY] Empty URL for: {replay.get('filename', '')}"
                        )

            except Exception as e:
                logger.warning(f"  [REPLAY] Selenium resolution failed: {e}")
            finally:
                try:
                    driver.quit()
                except Exception:
                    pass

        # ── Resolve all token URLs upfront in ONE browser session ─────────────
        unresolved = [
            r for r in replays
            if 'playVideo.action' in str(r.get('download_url', ''))
        ]
        if unresolved:
            logger.info(f"  [REPLAY] {len(unresolved)} replay(s) need URL resolution...")
            _resolve_all_unresolved_via_selenium(unresolved)

        for replay in replays:
            if self._check_stop():
                return

            filename = self._sanitize_name(replay['filename'])
            if not filename.lower().endswith('.mp4'):
                filename += '.mp4'

            file_path = replay_dir / filename
            download_url = replay['download_url']

            # If the URL is still a token URL here, the upfront Selenium pass
            # failed to match this entry — log and skip rather than re-opening a browser.
            if 'playVideo.action' in str(download_url):
                logger.warning(f"      [FAIL] {file_path.name}: replay URL still unresolved after Selenium pass")
                self.stats['failed'] += 1
                self._increment_files_done()
                self._record_file(
                    'failed',
                    file_path.name,
                    error="Replay URL unresolved after upfront Selenium resolution",
                    error_type='ReplayResolveError',
                    file_path=file_path
                )
                self._emit_progress()
                continue

            logger.info(f"    [REPLAY] {filename}")
            self._download_file(download_url, file_path, replay.get('sub_title', filename))

    def print_stats(self):
        """Print download statistics."""
        logger.info(f"\n=== Download Statistics ===")
        logger.info(f"Downloaded: {self.stats['downloaded']}")
        logger.info(f"Skipped:    {self.stats['skipped']}")
        logger.info(f"Failed:     {self.stats['failed']}")
        logger.info(f"Total:      {sum(self.stats.values())}")

    def _record_file(self, status: str, filename: str, **kwargs):
        """Record file information for sync report."""
        # If we have a course directory context, calculate relative path
        # to properly handle nested folders
        if self.current_course_dir and kwargs.get('file_path'):
            try:
                file_path = Path(kwargs['file_path'])
                relative_path = file_path.relative_to(self.current_course_dir)
                filename = str(relative_path).replace('\\', '/')  # Normalize to forward slashes
            except (ValueError, Exception):
                # If relative path calculation fails, fall back to just the filename
                pass

        record = {
            'name': filename,
            'course': self.current_course_name or 'Unknown',
            'course_id': self.current_course_id or 'unknown'
        }

        # Add optional fields
        if 'size' in kwargs:
            record['size'] = kwargs['size']
        if 'url' in kwargs:
            record['url'] = kwargs['url']
        if 'reason' in kwargs:
            record['reason'] = kwargs['reason']
        if 'error' in kwargs:
            record['error'] = kwargs['error']
        if 'error_type' in kwargs:
            record['error_type'] = kwargs['error_type']
        if 'traceback' in kwargs:
            record['traceback'] = kwargs['traceback']

        self.file_records[status].append(record)

    def generate_report(self):
        """Generate sync report and save to reports directory."""
        try:
            finished_at = datetime.now()

            report = {
                'sync_id': self.sync_id,
                'started_at': self.started_at.strftime("%Y-%m-%d %H:%M:%S"),
                'finished_at': finished_at.strftime("%Y-%m-%d %H:%M:%S"),
                'duration_seconds': int((finished_at - self.started_at).total_seconds()),
                'status': 'stopped' if self._stop_event.is_set() else ('success' if self.stats['failed'] == 0 else 'partial_failure'),
                'files': self.file_records,
                'summary': self.stats
            }

            report_path = self.reports_dir / f'{self.sync_id}.json'
            with open(report_path, 'w', encoding='utf-8') as f:
                json.dump(report, f, indent=2, ensure_ascii=False)

            logger.info(f"\nSync report saved to: {report_path}")
            return report_path

        except Exception as e:
            logger.error(f"Failed to generate sync report: {e}")
            return None
