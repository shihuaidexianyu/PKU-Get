"""
Replay downloader - Capture JWT and metadata from PKU's online replay system,
then resolve downloadable video URLs.
"""
import os
import re
import json
import time
import base64
import requests as _requests_lib
from html import unescape
from typing import Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse, parse_qs, unquote, quote as _url_quote

from bs4 import BeautifulSoup
from .logger import get_logger

logger = get_logger('replay')

# Verbose debug logging when set
REPLAY_DEBUG: bool = os.environ.get('PKU_REPLAY_DEBUG', '').lower() in ('1', 'true', 'yes')

# m3u8 URL pattern for hash extraction
M3U8_PATTERN = re.compile(
    r'https://resourcese\.pku\.edu\.cn/play/0/harpocrates/\d+/\d+/\d+/([a-zA-Z0-9]+)/.+/playlist\.m3u8'
)

DOWNLOAD_URL_TEMPLATE = (
    "https://course.pku.edu.cn/webapps/bb-streammedia-hqy-BBLEARN/"
    "downloadVideo.action?resourceId={}"
)

PLAYER_URL_TEMPLATE = "https://onlineroomse.pku.edu.cn/player?course_id={}"
PLAYER_URL_TEMPLATE_WITH_TOKEN = "https://onlineroomse.pku.edu.cn/player?course_id={course_id}&token={token}"

# JavaScript XHR interceptor — injected into the player page to capture
# both the JWT token and the API response data.
# Uses postMessage to propagate captured data from cross-origin iframes
# (onlineroomse.pku.edu.cn) back to the main frame (course.pku.edu.cn).
XHR_INTERCEPTOR_JS = """
window.__PKU_GET_JWT = '';
window.__PKU_GET_REPLAY_DATA = null;

// Listen for postMessage from child iframes (active in main frame)
window.addEventListener('message', function(e) {
    if (e.data && e.data.type === '__PKU_GET_REPLAY') {
        window.__PKU_GET_REPLAY_DATA = e.data.data;
        window.__PKU_GET_JWT = e.data.jwt || '';
    }
});

(function() {
    var origSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    var origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
        if (!this._pku_headers) this._pku_headers = {};
        this._pku_headers[header] = value;
        origSetRequestHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
        var xhr = this;
        xhr.addEventListener('load', function() {
            if (xhr.responseURL && xhr.responseURL.indexOf('get-sub-info-by-auth-data') !== -1) {
                try {
                    window.__PKU_GET_REPLAY_DATA = JSON.parse(xhr.response);
                } catch(e) {}

                if (xhr._pku_headers) {
                    for (var h in xhr._pku_headers) {
                        if (h.toLowerCase() === 'authorization') {
                            var parts = xhr._pku_headers[h].split(' ');
                            window.__PKU_GET_JWT = parts.length > 1 ? parts[1] : parts[0];
                            break;
                        }
                    }
                }

                // Propagate to parent frame via postMessage (cross-origin safe)
                try {
                    if (window !== window.top) {
                        window.top.postMessage({
                            type: '__PKU_GET_REPLAY',
                            jwt: window.__PKU_GET_JWT,
                            data: window.__PKU_GET_REPLAY_DATA
                        }, '*');
                    }
                } catch(e) {}
            }
        });
        origSend.apply(this, arguments);
    };
})();
"""

MAX_CAPTURE_ATTEMPTS = 3


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


def _extract_token_from_play_href(href: str) -> Optional[str]:
    """Extract token from playVideo.action URL."""
    try:
        parsed = urlparse(href)
        query = parse_qs(parsed.query)
        token_values = query.get('token', [])
        if token_values:
            return unquote(token_values[0])
        match = re.search(r'token=([^&]+)', href)
        return unquote(match.group(1)) if match else None
    except Exception:
        return None


def extract_jwt_from_play_url(play_url: str) -> Optional[str]:
    """Public helper: extract the onlineroomse JWT from a playVideo.action?token=... URL."""
    return _extract_token_from_play_href(play_url)


def _extract_streammedia_entries(page_html: str, page_url: str, default_title: str = "") -> List[Dict]:
    """Parse streammedia list page and return replay entries with play URLs."""
    soup = BeautifulSoup(page_html, 'html.parser')
    entries: List[Dict] = []
    seen = set()

    for a_tag in soup.find_all('a'):
        href = a_tag.get('href', '')
        if 'playVideo.action' not in href or 'token=' not in href:
            continue

        play_url = urljoin(page_url, href)
        if play_url in seen:
            continue
        seen.add(play_url)

        token = _extract_token_from_play_href(href)
        payload = _decode_jwt_payload(token) if token else None
        replay_id = str(payload.get('hqySubId', '')).strip() if payload else ''

        row_text = ""
        tr = a_tag.find_parent('tr')
        if tr:
            row_text = tr.get_text(separator=' ', strip=True)

        lecturer_name = ""
        m_teacher = re.search(r'教师[:：]\s*([^\s]+)', row_text)
        if m_teacher:
            lecturer_name = m_teacher.group(1)

        sub_title = ""
        m_name = re.search(r'^\s*(.*?)\s+时间[:：]', row_text)
        if m_name:
            sub_title = m_name.group(1).strip()
        if not sub_title and payload:
            sub_title = str(payload.get('recordTime', '')).strip()
        if not sub_title:
            sub_title = a_tag.get_text(strip=True) or "回放"

        title = default_title
        if payload and payload.get('hqyCourseId'):
            title = default_title or f"Course-{payload.get('hqyCourseId')}"
        if not title:
            title = "Replay"

        filename = f"{title} - {sub_title} - {lecturer_name}.mp4" if lecturer_name else f"{title} - {sub_title}.mp4"

        entries.append({
            'replay_id': replay_id or sub_title,
            'title': title,
            'sub_title': sub_title,
            'lecturer_name': lecturer_name,
            'download_url': play_url,  # lazy-resolve at download time
            'is_m3u8': False,
            'filename': filename,
        })

    return entries


def _extract_streammedia_page_links(page_html: str, page_url: str) -> List[str]:
    """Find additional videoList page URLs (pagination links)."""
    soup = BeautifulSoup(page_html, 'html.parser')
    links: List[str] = []
    seen = set()
    for a_tag in soup.find_all('a'):
        href = a_tag.get('href', '')
        if 'videoList.action' not in href:
            continue
        full = urljoin(page_url, href)
        if full in seen:
            continue
        seen.add(full)
        links.append(full)
    return links


def resolve_streammedia_download_url(session, play_url: str) -> Optional[str]:
    """Resolve a playVideo token URL into a direct downloadable URL."""
    try:
        response = session.get(play_url, timeout=20)
        response.raise_for_status()
        page_text = response.text
        if REPLAY_DEBUG:
            logger.debug(f"[RESOLVE] play_url response: status={response.status_code}, "
                         f"final_url={response.url[:120]}, length={len(page_text)}")
            # Detect yjloginse redirects or JS-only pages
            if 'yjloginse' in response.url or 'yjloginse' in page_text:
                logger.debug("[RESOLVE] Response contains yjloginse (SSO redirect needed)")
            js_redir = _extract_js_redirect(page_text)
            if js_redir:
                logger.debug(f"[RESOLVE] Page has JS redirect to: {js_redir[:120]}")
    except Exception as e:
        logger.debug(f"Failed to open play URL for resolution: {e}")
        return None

    # Most direct case: page already contains downloadVideo.action URL.
    m_direct = re.search(r'downloadVideo\.action\?[^"\'>\s]+', page_text)
    if m_direct:
        return urljoin(response.url, unescape(m_direct.group(0)))

    # Common case: page contains m3u8 URL; convert hash to downloadVideo.action.
    m_m3u8 = M3U8_PATTERN.search(page_text)
    if m_m3u8:
        resource_hash = m_m3u8.group(1)
        return DOWNLOAD_URL_TEMPLATE.format(resource_hash)

    # Fallback: direct media URL.
    m_mp4 = re.search(r'https?://[^"\'>\s]+\.mp4(?:\?[^"\'>\s]*)?', page_text)
    if m_mp4:
        return m_mp4.group(0)

    m_playlist = re.search(r'https?://[^"\'>\s]+playlist\.m3u8(?:\?[^"\'>\s]*)?', page_text)
    if m_playlist:
        return m_playlist.group(0)

    return None


def capture_replays_via_streammedia_session(session, course_url: str, course_name: str = "") -> List[Dict]:
    """Capture replay list from Blackboard streammedia pages without Selenium.

    This path avoids onlineroomse login/phone-binding prompts by reading the
    already-accessible '课堂实录' pages under course.pku.edu.cn.
    """
    try:
        course_page = session.get(course_url, timeout=20)
        course_page.raise_for_status()
    except Exception as e:
        logger.warning(f"Failed to open course page for streammedia capture: {e}")
        return []

    soup = BeautifulSoup(course_page.text, 'html.parser')
    menu = soup.find('ul', id='courseMenuPalette_contents')
    if not menu:
        return []

    candidate_links: List[str] = []
    for link in menu.find_all('a'):
        href = link.get('href', '')
        text = link.get_text(strip=True)
        if not href:
            continue
        if '课堂实录' in text or 'bb-streammedia' in href or 'streammedia' in href:
            candidate_links.append(urljoin(course_page.url, href))

    if not candidate_links:
        return []

    all_entries: List[Dict] = []
    seen_play_urls = set()

    for candidate in candidate_links:
        queue = [candidate]
        visited = set()
        while queue and len(visited) < 20:
            url = queue.pop(0)
            if url in visited:
                continue
            visited.add(url)

            try:
                page = session.get(url, timeout=20)
                page.raise_for_status()
            except Exception:
                continue

            entries = _extract_streammedia_entries(page.text, page.url, course_name)
            for entry in entries:
                play_url = entry['download_url']
                if play_url in seen_play_urls:
                    continue
                seen_play_urls.add(play_url)
                all_entries.append(entry)

            for next_url in _extract_streammedia_page_links(page.text, page.url):
                if next_url not in visited:
                    queue.append(next_url)

        if all_entries:
            break

    return all_entries


def _score_vod_url(url: str) -> int:
    """Score a resourcese.pku.edu.cn VOD URL by estimated quality (higher = better)."""
    u = url.lower()
    for keyword, score in [
        ('newhighvideo', 40), ('4000k', 40), ('_1080', 35),
        ('2000k', 30), ('1280_720', 30),
        ('newmidvideo', 20), ('1000k', 20), ('854_480', 20), ('_480', 18),
        ('newlowvideo', 10), ('500k', 10), ('640_360', 10), ('_360', 8),
    ]:
        if keyword in u:
            return score
    return 5  # unknown quality, prefer over nothing


def _extract_best_vod_url(content: dict, raw_json: str = '') -> Optional[str]:
    """Scan content dict (and optionally raw JSON) for all resourcese VOD URLs.

    Returns the highest-quality URL found, or None.
    Handles cases where sub_content stores multiple quality variants
    across different fields (e.g. newLowVideo, newMidVideo, newHighVideo).
    """
    VOD_INFIX = 'resourcese.pku.edu.cn/play/video/vod/'
    candidates: List[str] = []

    def _walk(obj: object) -> None:
        if isinstance(obj, str):
            if VOD_INFIX in obj:
                for part in re.split(r'["\'\s,;]', obj):
                    if VOD_INFIX in part:
                        candidates.append(part.strip('"\'/\\'))
        elif isinstance(obj, dict):
            for v in obj.values():
                _walk(v)
        elif isinstance(obj, list):
            for v in obj:
                _walk(v)

    _walk(content)

    # Also scan the raw JSON string to catch URLs inside escaped sub-strings.
    if raw_json:
        for m in re.finditer(
            r'https?://resourcese\.pku\.edu\.cn/play/video/vod/[^"\\>\s]+',
            raw_json
        ):
            url = m.group(0).rstrip('.,;)\'"')
            candidates.append(url)

    if not candidates:
        return None
    return max(set(candidates), key=_score_vod_url)


def resolve_download_url(sub_content_json: str) -> Tuple[str, bool]:
    """Resolve the actual download URL from sub_content JSON string.

    Returns (download_url, is_m3u8_converted).
    """
    content = json.loads(sub_content_json)
    save_playback = content.get('save_playback', {})
    is_m3u8 = save_playback.get('is_m3u8', 'no') == 'yes'
    raw_url = save_playback.get('contents', '')

    if is_m3u8 and raw_url:
        match = M3U8_PATTERN.search(raw_url)
        if match:
            resource_hash = match.group(1)
            return DOWNLOAD_URL_TEMPLATE.format(resource_hash), True
        logger.warning("m3u8 URL did not match expected pattern, using raw URL")
        return raw_url, False

    # For direct MP4: scan the entire sub_content for all quality variants
    # and prefer the highest quality one (e.g. newHighVideo over newLowVideo).
    best_vod = _extract_best_vod_url(content, raw_json=sub_content_json)
    if best_vod:
        if best_vod != raw_url:
            logger.debug(f"[REPLAY] Upgraded to higher-quality URL: ...{best_vod[-70:]}")
        return best_vod, False

    return raw_url, False


def parse_replay_list(api_response: dict) -> List[Dict]:
    """Parse the API response into a list of replay metadata dicts.

    Each dict contains:
      - title: course title
      - sub_title: replay session title (usually date)
      - lecturer_name: instructor name
      - download_url: resolved direct download URL
      - is_m3u8: whether the original was m3u8 format
      - filename: suggested filename for saving
    """
    replays = []
    items = api_response.get('list', [])

    for item in items:
        title = item.get('title', '')
        sub_title = item.get('sub_title', '')
        lecturer_name = item.get('lecturer_name', '')
        sub_content = item.get('sub_content', '{}')
        replay_id = (
            item.get('sub_id')
            or item.get('subId')
            or item.get('id')
            or item.get('hqySubId')
            or sub_title
        )

        try:
            download_url, is_m3u8 = resolve_download_url(sub_content)
        except Exception as e:
            logger.error(f"Failed to resolve URL for '{sub_title}': {e}")
            continue

        if not download_url:
            logger.warning(f"No download URL for replay '{sub_title}', skipping")
            continue

        filename = f"{title} - {sub_title} - {lecturer_name}.mp4"

        replays.append({
            'replay_id': str(replay_id),
            'title': title,
            'sub_title': sub_title,
            'lecturer_name': lecturer_name,
            'download_url': download_url,
            'is_m3u8': is_m3u8,
            'filename': filename,
        })

    return replays


# Known API base URL for the onlineroomse replay metadata endpoint.
# Mirrors the XHR the player SPA makes that PKU-Art intercepts.
ONLINEROOMSE_API_URL = "https://onlineroomse.pku.edu.cn/live/get-sub-info-by-auth-data"

# yjloginse SSO endpoint that issues onlineroomse session cookies given a valid JWT.
# tenant_code=226 is the fixed code for onlineroomse.pku.edu.cn.
YJLOGINSE_URL = "https://yjloginse.pku.edu.cn/"
YJLOGINSE_TENANT_CODE = "226"


def _parse_cas_form(html: str, base_url: str) -> Optional[Tuple[str, Dict[str, str]]]:
    """Parse CAS auto-submit form from iaaa.pku.edu.cn HTML.

    Returns (action_url, form_data) or None if no form found.
    """
    soup = BeautifulSoup(html, 'html.parser')
    form = soup.find('form')
    if not form:
        return None
    action = form.get('action', '')
    if not action:
        return None
    action_url = urljoin(base_url, action)
    data: Dict[str, str] = {}
    for inp in form.find_all('input'):
        name = inp.get('name')
        if name:
            data[name] = inp.get('value', '')
    return action_url, data


def _extract_js_redirect(html: str) -> Optional[str]:
    """Extract URL from common JS redirect patterns in HTML.

    Handles:
      - window.location = "..."
      - window.location.href = "..."
      - window.location.replace("...")
      - <meta http-equiv="refresh" content="0;url=...">
    """
    # JS location assignment
    m = re.search(r'window\.location(?:\.href)?\s*=\s*["\']([^"\']+)["\']', html)
    if m:
        return m.group(1)
    # JS location.replace
    m = re.search(r'window\.location\.replace\(\s*["\']([^"\']+)["\']\s*\)', html)
    if m:
        return m.group(1)
    # meta refresh
    m = re.search(r'<meta[^>]+http-equiv=["\']refresh["\'][^>]+content=["\'][^"\']*url=([^"\'>\s]+)', html, re.IGNORECASE)
    if m:
        return unescape(m.group(1))
    return None


def _establish_onlineroomse_session(http: '_requests_lib.Session',
                                    course_id: str, token: str,
                                    play_url: str) -> bool:
    """Follow the yjloginse SSO flow to set onlineroomse.pku.edu.cn cookies.

    The yjloginse SSO validates the JWT embedded in the player URL and sets a
    session cookie for onlineroomse. We follow redirects step-by-step to handle
    CAS form POSTs and JS redirects that `allow_redirects=True` cannot follow.

    Returns True if onlineroomse cookies were obtained.
    """
    yjloginse_url = None

    # --- attempt 1: extract from playVideo.action page HTML ---
    try:
        play_resp = http.get(play_url, timeout=20, allow_redirects=True)
        html = play_resp.text
        if REPLAY_DEBUG:
            logger.debug(f"[SSO] playVideo.action response: status={play_resp.status_code}, "
                         f"final_url={play_resp.url[:120]}, length={len(html)}")

        # Check if the page is a JS-only redirect page (no yjloginse URL visible)
        if 'yjloginse' not in html and _extract_js_redirect(html):
            js_url = _extract_js_redirect(html)
            if REPLAY_DEBUG:
                logger.debug(f"[SSO] playVideo.action page is JS redirect to: {js_url[:120]}")
            if 'yjloginse' in (js_url or ''):
                yjloginse_url = js_url
            else:
                # Follow the JS redirect to find yjloginse
                try:
                    js_resp = http.get(js_url, timeout=20, allow_redirects=False)
                    if REPLAY_DEBUG:
                        logger.debug(f"[SSO] JS redirect response: status={js_resp.status_code}")
                    if js_resp.status_code in (301, 302, 303, 307, 308):
                        loc = js_resp.headers.get('Location', '')
                        if 'yjloginse' in loc:
                            yjloginse_url = urljoin(js_resp.url, loc)
                except Exception as e:
                    logger.debug(f"[SSO] Failed to follow JS redirect: {e}")

        # Look for the yjloginse URL in the page (iframe src, script, or meta refresh)
        if not yjloginse_url:
            m = re.search(r'https://yjloginse\.pku\.edu\.cn/[^\s"\'<>]+', html)
            if m:
                yjloginse_url = unescape(m.group(0))
                logger.debug(f"[API] Found yjloginse URL in page HTML: {yjloginse_url[:120]}")
            else:
                logger.debug("[API] yjloginse URL not found in playVideo.action HTML, will construct")
    except Exception as e:
        logger.debug(f"[API] Could not fetch playVideo.action page: {e}")

    # --- attempt 2: construct directly ---
    if not yjloginse_url:
        forward = (f"https://onlineroomse.pku.edu.cn/player"
                   f"?course_id={course_id}&token={token}")
        yjloginse_url = (f"{YJLOGINSE_URL}"
                         f"?tenant_code={YJLOGINSE_TENANT_CODE}"
                         f"&forward={_url_quote(forward, safe='')}")
        logger.debug(f"[API] Constructed yjloginse URL: {yjloginse_url[:120]}")

    # --- Follow the SSO chain step by step ---
    try:
        logger.info("[API] Following yjloginse SSO to get onlineroomse session cookies...")
        url = yjloginse_url
        max_hops = 15

        for hop in range(max_hops):
            resp = http.get(url, timeout=20, allow_redirects=False)
            if REPLAY_DEBUG:
                logger.debug(f"[SSO] Hop {hop}: {resp.status_code} {url[:120]}")

            # HTTP redirect
            if resp.status_code in (301, 302, 303, 307, 308):
                location = resp.headers.get('Location', '')
                url = urljoin(resp.url, location)
                if REPLAY_DEBUG:
                    logger.debug(f"[SSO] Hop {hop}: redirect → {url[:120]}")
                continue

            # 200 OK — check for CAS form or JS redirect
            if resp.status_code == 200:
                body = resp.text

                # CAS auto-submit form (iaaa.pku.edu.cn)
                cas = _parse_cas_form(body, resp.url)
                if cas:
                    action_url, form_data = cas
                    if REPLAY_DEBUG:
                        logger.debug(f"[SSO] Hop {hop}: CAS form POST → {action_url[:120]}")
                    resp = http.post(action_url, data=form_data, timeout=20, allow_redirects=False)
                    if resp.status_code in (301, 302, 303, 307, 308):
                        url = urljoin(resp.url, resp.headers.get('Location', ''))
                        continue
                    elif resp.status_code == 200:
                        # Check if the POST response itself has a redirect
                        js_url = _extract_js_redirect(resp.text)
                        if js_url:
                            url = urljoin(resp.url, js_url)
                            continue
                    # If POST landed on final page, break
                    break

                # JS redirect
                js_url = _extract_js_redirect(body)
                if js_url:
                    url = urljoin(resp.url, js_url)
                    if REPLAY_DEBUG:
                        logger.debug(f"[SSO] Hop {hop}: JS redirect → {url[:120]}")
                    continue

                # No more redirects — we've landed
                break

            # Non-redirect, non-200 — stop
            if REPLAY_DEBUG:
                logger.debug(f"[SSO] Hop {hop}: unexpected status {resp.status_code}, stopping")
            break

        domains = list({c.domain for c in http.cookies})
        if REPLAY_DEBUG:
            logger.debug(f"[SSO] Cookie domains after chain: {domains}")
        has_onlineroomse = any('onlineroomse' in d for d in domains)
        if not has_onlineroomse:
            logger.warning("[API] No onlineroomse cookies after yjloginse follow "
                           f"(final URL: {url[:100]})")
        return has_onlineroomse
    except Exception as e:
        logger.warning(f"[API] Failed to follow yjloginse URL: {e}")
        return False


def capture_replays_via_api(play_url: str, session=None) -> List[Dict]:
    """Capture replay list by directly calling the onlineroomse API with the JWT.

    Auth flow (mirrors what the browser does when PKU-Art intercepts the XHR):
      1. Extract JWT from playVideo.action?token=<JWT>
      2. Follow yjloginse SSO → onlineroomse.pku.edu.cn to get session cookies
      3. Call get-sub-info-by-auth-data with Authorization: Bearer <JWT> + cookies
      4. Parse response with parse_replay_list()

    No browser / Selenium required.

    Args:
        play_url: A playVideo.action?token=<JWT> URL from the course page.
        session:  The authenticated course.pku.edu.cn requests.Session. Its cookies
                  are copied into a fresh session so the caller's state is unchanged.

    Returns:
        List of replay dicts (same format as parse_replay_list), or [] on failure.
    """
    token = extract_jwt_from_play_url(play_url)
    if not token:
        logger.warning("[API] No JWT found in play URL")
        return []

    payload = _decode_jwt_payload(token)
    if not payload:
        logger.warning("[API] Failed to decode JWT payload")
        return []

    course_id = str(payload.get('hqyCourseId', '')).strip()
    if not course_id:
        logger.warning("[API] No hqyCourseId in JWT payload")
        return []

    _browser_ua = (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
    )

    # Build a fresh session inheriting the caller's course.pku.edu.cn cookies.
    http = _requests_lib.Session()
    http.headers.update({
        'User-Agent': _browser_ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    })
    if session is not None:
        for cookie in session.cookies:
            try:
                http.cookies.set(cookie.name, cookie.value,
                                 domain=cookie.domain, path=cookie.path)
            except Exception:
                pass

    # ── JWT-only fast path ─────────────────────────────────────────────
    # Try the API with just the Bearer token (no session cookies needed).
    # If the onlineroomse API accepts JWT-only auth, we skip SSO entirely.
    jwt_headers = {
        'Authorization': f'Bearer {token}',
        'Referer': (f'https://onlineroomse.pku.edu.cn/player'
                    f'?course_id={course_id}&token={token}'),
        'Origin': 'https://onlineroomse.pku.edu.cn',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'User-Agent': _browser_ua,
    }
    try:
        jwt_resp = http.get(ONLINEROOMSE_API_URL, headers=jwt_headers, timeout=15)
        if REPLAY_DEBUG:
            logger.debug(f"[API] JWT-only fast path: status={jwt_resp.status_code}")
        if jwt_resp.status_code == 200:
            jwt_data = jwt_resp.json()
            jwt_replays = parse_replay_list(jwt_data)
            if jwt_replays:
                logger.info(f"[API] JWT-only fast path returned {len(jwt_replays)} replays "
                            f"for course {course_id} (SSO skipped)")
                return jwt_replays
            elif REPLAY_DEBUG:
                logger.debug("[API] JWT-only fast path: 200 but no replay entries parsed")
        elif REPLAY_DEBUG:
            logger.debug(f"[API] JWT-only fast path failed: status={jwt_resp.status_code}, "
                         f"body={jwt_resp.text[:300]}")
    except Exception as e:
        if REPLAY_DEBUG:
            logger.debug(f"[API] JWT-only fast path exception: {e}")

    # ── Full SSO path ──────────────────────────────────────────────────
    # Establish onlineroomse session cookies via yjloginse SSO.
    _establish_onlineroomse_session(http, course_id, token, play_url)

    # Call the API with JWT header + onlineroomse session cookies.
    api_headers = {
        'Authorization': f'Bearer {token}',
        'Referer': (f'https://onlineroomse.pku.edu.cn/player'
                    f'?course_id={course_id}&token={token}'),
        'Origin': 'https://onlineroomse.pku.edu.cn',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'User-Agent': _browser_ua,
    }

    try:
        resp = http.get(ONLINEROOMSE_API_URL, headers=api_headers, timeout=20)
        if REPLAY_DEBUG:
            logger.debug(f"[API] Response status: {resp.status_code}, URL: {resp.url}, "
                         f"redirects: {[r.status_code for r in resp.history]}")
        resp.raise_for_status()
        data = resp.json()
        replays = parse_replay_list(data)
        logger.info(f"[API] Direct API capture returned {len(replays)} replays for course {course_id}")
        return replays
    except Exception as e:
        logger.warning(f"[API] Direct API call failed: {e}")
        try:
            logger.debug(f"[API] Response status={resp.status_code}, "
                         f"final_url={resp.url}, "
                         f"body (first 500): {resp.text[:500]}")
        except Exception:
            pass
        return []


def resolve_replay_url_via_api(play_url: str, session=None) -> Optional[str]:
    """Resolve a playVideo.action token URL to a direct download URL via API.

    Calls capture_replays_via_api and returns the download_url for the specific
    replay identified by hqySubId in the JWT (falls back to the first result).

    Args:
        play_url: A playVideo.action?token=<JWT> URL.
        session:  Optional requests.Session.

    Returns:
        A resolved download URL string, or None on failure.
    """
    replays = capture_replays_via_api(play_url, session=session)
    if not replays:
        return None

    # Try to match the specific sub by hqySubId from the JWT
    token = extract_jwt_from_play_url(play_url)
    payload = _decode_jwt_payload(token) if token else None
    sub_id = str(payload.get('hqySubId', '')).strip() if payload else ''

    if sub_id:
        for r in replays:
            if str(r.get('replay_id', '')) == sub_id:
                url = r.get('download_url')
                if url:
                    logger.info(f"[API] Resolved specific sub {sub_id} to download URL")
                    return url

    # Fallback: return first available URL
    url = replays[0].get('download_url')
    if url:
        logger.info("[API] Resolved via first replay entry (sub_id not matched)")
    return url


def capture_replays_via_selenium(driver, replay_course_id: str,
                                  token: str = None,
                                  play_url: str = None) -> Tuple[Optional[str], List[Dict]]:
    """Navigate to the replay player page via Selenium and capture JWT + replay data.

    Auth flow (mirrors what the user does manually):
      1. Browser starts from play_url (course.pku.edu.cn/playVideo.action?token=...)
      2. Page JS redirects: course → yjloginse → iaaa (silent TGC auth) → onlineroomse player
      3. The onlineroomse SPA calls get-sub-info-by-auth-data (XHR)
      4. Our injected interceptor captures JWT + response data

    The XHR interceptor is registered via Chrome DevTools Protocol
    Page.addScriptToEvaluateOnNewDocument so it fires BEFORE any page JS on every
    navigation in the redirect chain — no need to refresh after landing.

    Args:
        driver:            Selenium WebDriver (already has iaaa + course cookies injected).
        replay_course_id:  The onlineroomse course_id.
        token:             Optional JWT for direct player URL (fallback if play_url absent).
        play_url:          playVideo.action URL to start from (preferred — full SSO path).

    Returns:
        (jwt_token, replay_list).  jwt_token may be None; replay_list may be empty.
    """
    if play_url:
        start_url = play_url
        logger.info(f"Navigating from playVideo.action URL for course {replay_course_id}")
    elif token:
        start_url = PLAYER_URL_TEMPLATE_WITH_TOKEN.format(
            course_id=replay_course_id, token=token
        )
        logger.info(f"Using token-authenticated player URL for course {replay_course_id}")
    else:
        start_url = PLAYER_URL_TEMPLATE.format(replay_course_id)

    # ── Register XHR interceptor as a CDP "evaluate on new document" script ─────
    # This fires before any page JS on every page load in the redirect chain,
    # eliminating the inject→refresh→re-inject race condition.
    cdp_ok = False
    try:
        driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
            "source": XHR_INTERCEPTOR_JS
        })
        cdp_ok = True
        logger.debug("[REPLAY] XHR interceptor registered as CDP init script")
    except Exception as _cdp_err:
        logger.debug(
            f"[REPLAY] CDP init script unavailable ({_cdp_err}), will inject manually"
        )

    for attempt in range(MAX_CAPTURE_ATTEMPTS):
        try:
            logger.info(
                f"Navigating to replay player (attempt {attempt + 1}/{MAX_CAPTURE_ATTEMPTS})..."
            )
            driver.get(start_url)

            if cdp_ok:
                # ── CDP path: interceptor already in place, just wait for data ──
                # The interceptor uses postMessage to propagate data from the
                # cross-origin onlineroomse iframe back to the main frame.
                # The redirect chain (course→yjloginse→iaaa→onlineroomse) can
                # take up to ~30s; add a further 15s for the SPA XHR call.
                max_wait = 60
                poll_start = time.time()
                last_log = poll_start
                iframe_checked = False
                while time.time() - poll_start < max_wait:
                    # Check main frame (postMessage listener stores data here)
                    data = driver.execute_script("return window.__PKU_GET_REPLAY_DATA;")
                    if data:
                        jwt = driver.execute_script("return window.__PKU_GET_JWT || '';")
                        try:
                            current = driver.current_url
                        except Exception:
                            current = '<unknown>'
                        logger.info(
                            f"[REPLAY] Captured replay data (jwt={'yes' if jwt else 'no'}), "
                            f"URL: {current[:80]}"
                        )
                        replays = parse_replay_list(data)
                        return (jwt or None), replays

                    # After 20s, also try checking iframes directly as fallback
                    # (postMessage may be blocked by stricter CSP policies)
                    elapsed = time.time() - poll_start
                    if not iframe_checked and elapsed > 20:
                        iframe_checked = True
                        try:
                            iframes = driver.find_elements('tag name', 'iframe')
                            for i, iframe in enumerate(iframes):
                                try:
                                    iframe_src = iframe.get_attribute('src') or ''
                                    if REPLAY_DEBUG:
                                        logger.debug(f"[REPLAY] Found iframe {i}: {iframe_src[:100]}")
                                    driver.switch_to.frame(iframe)
                                    iframe_data = driver.execute_script(
                                        "return window.__PKU_GET_REPLAY_DATA;"
                                    )
                                    if iframe_data:
                                        iframe_jwt = driver.execute_script(
                                            "return window.__PKU_GET_JWT || '';"
                                        )
                                        logger.info("[REPLAY] Captured data from iframe")
                                        driver.switch_to.default_content()
                                        replays = parse_replay_list(iframe_data)
                                        return (iframe_jwt or None), replays
                                    driver.switch_to.default_content()
                                except Exception:
                                    driver.switch_to.default_content()
                        except Exception as _iframe_err:
                            if REPLAY_DEBUG:
                                logger.debug(f"[REPLAY] Iframe check failed: {_iframe_err}")

                    # Log URL progress every 10 s
                    if time.time() - last_log >= 10:
                        try:
                            logger.debug(
                                f"[REPLAY] Still waiting... "
                                f"{int(time.time() - poll_start)}s, "
                                f"URL: {driver.current_url[:80]}"
                            )
                        except Exception:
                            pass
                        last_log = time.time()
                    time.sleep(0.5)
                try:
                    final_url = driver.current_url
                except Exception:
                    final_url = '<unknown>'
                logger.warning(
                    f"Attempt {attempt + 1}: data not captured after {max_wait}s "
                    f"(URL: {final_url[:100]})"
                )

            else:
                # ── Manual injection fallback (non-CDP browsers, e.g. Safari) ──
                # Wait for the SSO chain to land on onlineroomse, then inject +
                # refresh + re-inject so the interceptor catches the next XHR.
                if play_url:
                    redirect_deadline = time.time() + 30
                    landed = False
                    while time.time() < redirect_deadline:
                        try:
                            current = driver.current_url
                        except Exception:
                            time.sleep(0.5)
                            continue
                        if 'onlineroomse.pku.edu.cn' in current:
                            logger.info(f"Landed on onlineroomse player: {current[:100]}")
                            landed = True
                            break
                        time.sleep(0.5)
                    if not landed:
                        logger.warning(
                            f"Attempt {attempt + 1}: did not reach onlineroomse after 30s "
                            f"(URL: {driver.current_url[:100]})"
                        )
                        continue

                driver.execute_script(XHR_INTERCEPTOR_JS)
                driver.refresh()
                time.sleep(0.5)
                driver.execute_script(XHR_INTERCEPTOR_JS)

                max_wait = 15
                poll_start = time.time()
                while time.time() - poll_start < max_wait:
                    jwt = driver.execute_script("return window.__PKU_GET_JWT || '';")
                    data = driver.execute_script("return window.__PKU_GET_REPLAY_DATA;")
                    if data and jwt:
                        logger.info("Successfully captured JWT and replay data")
                        replays = parse_replay_list(data)
                        return jwt, replays
                    if data and not jwt:
                        # Return without JWT rather than discarding valid data
                        if time.time() - poll_start > max_wait / 2:
                            replays = parse_replay_list(data)
                            return None, replays
                    time.sleep(0.5)
                logger.warning(f"Capture attempt {attempt + 1} timed out")

        except Exception as e:
            logger.error(f"Error during capture attempt {attempt + 1}: {e}")

    logger.error(f"Failed to capture replay data after {MAX_CAPTURE_ATTEMPTS} attempts")
    return None, []
