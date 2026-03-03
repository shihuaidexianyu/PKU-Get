/**
 * Internationalization (i18n) support
 * 国际化支持
 */

export const translations = {
  en: {
    // App Title
    appTitle: 'PKU MANAGER',

    // Navigation & Views
    dashboard: 'Dashboard',
    settings: 'Settings',
    login: 'Login',

    // Login View
    loginTitle: 'PKU-Get',
    loginSubtitle: 'PKU Course Downloader to easily manage and sync your course materials',
    username: 'Student ID',
    password: 'Password',
    downloadDir: 'Download Directory',
    selectFolder: 'Select Folder',
    loginButton: 'Login & Fetch Courses',
    loggingIn: 'Logging in...',

    // Dashboard
    lastSync: 'Last Sync',
    totalFiles: 'Total Files',
    activeCount: 'Active',
    skippedCount: 'Skipped',
    syncNow: 'Sync Now',
    syncing: 'Syncing...',
    refreshCourses: 'Refresh Courses',
    refreshCourseInfo: 'Refresh Course Info',
    refreshingCourseInfo: 'Refreshing...',
    refreshCourseInfoDone: 'Course info updated!',
    refreshCourseInfoTooltip: 'Re-fetch available sections for all courses (detects newly added tabs)',
    viewSyncHistory: 'View Sync History',

    // Course Card
    skip: 'Skip',
    active: 'Active',
    selectTabs: 'Select Tabs',
    openFolder: 'Open Folder',
    alias: 'Alias',

    // Settings
    settingsTitle: 'Settings',
    credentials: 'Credentials',
    downloadSettings: 'Download Settings',
    browserSettings: 'Browser Settings',
    advanced: 'Advanced',
    save: 'Save',
    cancel: 'Cancel',

    // Settings - Fields
    concurrentDownloads: 'Concurrent Downloads',
    concurrentDownloadsDesc: 'Number of files to download simultaneously',
    browser: 'Browser',
    headlessMode: 'Headless Mode',
    headlessModeDesc: 'Run browser in background (faster, no UI)',
    autoSync: 'Auto-Sync on Startup',
    autoSyncDesc: 'Automatically sync courses when app starts',
    language: 'Language',

    // Browser Options
    browserEdge: 'Edge (Recommended)',
    browserChrome: 'Chrome (Recommended)',
    browserSafari: 'Safari',
    browserFirefox: 'Firefox',

    // Browser Messages
    safariWarning: '⚠️ Safari does not support headless mode and only works on macOS',
    edgeInfo: '💡 Edge is pre-installed on Windows 10/11',
    chromeInfo: '💡 Chrome: Fast and reliable',
    firefoxInfo: '💡 Firefox: Open source browser',

    // Progress Bar
    syncingCourse: 'Syncing:',
    scanningCourse: 'Scanning:',
    scanningFiles: 'Scanning files...',
    course: 'Course',
    currentFile: 'Current file:',
    courseProgress: 'Course Progress',
    hideLog: 'Hide Log',
    expandLog: 'Expand Log',
    collapse: 'Collapse',
    clickToExpand: 'Click to expand',
    pause: 'Pause',
    resume: 'Resume',
    stop: 'Stop',
    paused: 'Paused',
    stopped: 'Stopped',

    // Stats
    downloaded: 'Downloaded',
    skipped: 'Skipped',
    failed: 'Failed',

    // Sync Report
    syncComplete: 'Sync Complete!',
    duration: 'Duration',
    close: 'Close',

    // Messages
    noCoursesSelected: 'No courses selected for download',
    loginSuccess: 'Login successful',
    loginFailed: 'Login failed',
    configSaved: 'Configuration saved',

    // Help
    help: 'Help',
    helpTitle: 'PKU Course Auto Downloader - Help',

    // Sync History
    syncHistory: 'Sync History',
    noSyncHistory: 'No sync history available',

    // Common
    loading: 'Loading...',
    never: 'Never',
    yes: 'Yes',
    no: 'No',

    // Replays
    downloadReplays: 'Replays',
    fetchReplayList: 'Fetch Replay List',
    fetchingReplays: 'Fetching...',
    noReplays: 'No replays found',
    replaysAvailable: 'replays',

    // Historical Courses
    historicalCourse: 'Historical',
    showHistoryToggle: 'Show History Courses Option',
    showHistoryToggleDesc: 'Display the option to include historical courses',
    includeHistory: 'Include Historical Courses',
    includeHistoryDesc: 'Fetch courses from previous semesters on next login',
    historicalCoursesSection: 'Historical Courses',
  },

  zh: {
    // App Title
    appTitle: '北大课程管理',

    // Navigation & Views
    dashboard: '课程菜单',
    settings: '设置',
    login: '登录',

    // Login View
    loginTitle: 'PKU-Get|未名拾课',
    loginSubtitle: '北京大学教学网下载助手，轻松管理与同步课程资料',
    username: '学号',
    password: '密码',
    downloadDir: '下载目录',
    selectFolder: '选择文件夹',
    loginButton: '登录并获取课程',
    loggingIn: '登录中...',

    // Dashboard
    lastSync: '上次同步',
    totalFiles: '总文件数',
    activeCount: '已启用',
    skippedCount: '已跳过',
    syncNow: '立即同步',
    syncing: '同步中...',
    refreshCourses: '刷新课程',
    refreshCourseInfo: '刷新课程信息',
    refreshingCourseInfo: '刷新中...',
    refreshCourseInfoDone: '课程信息已更新！',
    refreshCourseInfoTooltip: '重新获取各课程的可用板块（检测新增模块）',
    viewSyncHistory: '查看同步历史',

    // Course Card
    skip: '跳过',
    active: '启用',
    selectTabs: '选择标签页',
    openFolder: '打开文件夹',
    alias: '别名',

    // Settings
    settingsTitle: '设置',
    credentials: '账号凭证',
    downloadSettings: '下载设置',
    browserSettings: '浏览器设置',
    advanced: '高级设置',
    save: '保存',
    cancel: '取消',

    // Settings - Fields
    concurrentDownloads: '并发下载数',
    concurrentDownloadsDesc: '同时下载的文件数量',
    browser: '浏览器',
    headlessMode: '无头模式',
    headlessModeDesc: '在后台运行浏览器（更快，无界面）',
    autoSync: '启动时自动同步',
    autoSyncDesc: '应用启动时自动同步课程',
    language: '语言',

    // Browser Options
    browserEdge: 'Edge（推荐）',
    browserChrome: 'Chrome（推荐）',
    browserSafari: 'Safari',
    browserFirefox: 'Firefox',

    // Browser Messages
    safariWarning: '⚠️ Safari 不支持无头模式，且仅适用于 macOS',
    edgeInfo: '💡 Edge 已预装在 Windows 10/11 上',
    chromeInfo: '💡 Chrome：快速可靠',
    firefoxInfo: '💡 Firefox：开源浏览器',

    // Progress Bar
    syncingCourse: '正在同步：',
    scanningCourse: '正在扫描：',
    scanningFiles: '正在扫描文件...',
    course: '课程',
    currentFile: '当前文件：',
    courseProgress: '课程进度',
    hideLog: '隐藏日志',
    expandLog: '展开日志',
    collapse: '收起',
    clickToExpand: '点击展开',
    pause: '暂停',
    resume: '继续',
    stop: '停止',
    paused: '已暂停',
    stopped: '已停止',

    // Stats
    downloaded: '已下载',
    skipped: '已跳过',
    failed: '失败',

    // Sync Report
    syncComplete: '同步完成！',
    duration: '耗时',
    close: '关闭',

    // Messages
    noCoursesSelected: '未选择要下载的课程',
    loginSuccess: '登录成功',
    loginFailed: '登录失败',
    configSaved: '配置已保存',

    // Help
    help: '帮助',
    helpTitle: '北大课程自动下载器 - 帮助',

    // Sync History
    syncHistory: '同步历史',
    noSyncHistory: '暂无同步历史',

    // Common
    loading: '加载中...',
    never: '从未',
    yes: '是',
    no: '否',

    // Replays
    downloadReplays: '录播',
    fetchReplayList: '获取录播列表',
    fetchingReplays: '获取中...',
    noReplays: '未找到录播',
    replaysAvailable: '节录播',

    // Historical Courses
    historicalCourse: '历史课程',
    showHistoryToggle: '显示历史课程选项',
    showHistoryToggleDesc: '显示是否包含历史课程的选项',
    includeHistory: '包含历史课程',
    includeHistoryDesc: '下次登录时获取往期学期的课程',
    historicalCoursesSection: '历史课程',
  }
};

export const getTranslation = (lang, key) => {
  return translations[lang]?.[key] || translations['en'][key] || key;
};

export const t = (key, lang = 'en') => {
  return getTranslation(lang, key);
};
