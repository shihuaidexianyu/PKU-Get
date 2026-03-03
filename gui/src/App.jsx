import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Download, Settings, Folder, LogIn, LogOut, Check, X, Play, Pause, Square, RefreshCw, Edit2, HardDrive, Clock, FileText, Search, Filter, Sun, Moon, ChevronUp, ChevronDown, HelpCircle, FolderOpen, ExternalLink, Github, Video, Archive } from 'lucide-react';
import clsx from 'clsx';
import { t } from './i18n';  // 🔑 导入翻译函数

// Mock API for browser development
const mockApi = {
  get_init_state: async () => ({
    view: 'dashboard',
    config: { username: 'test', download_dir: 'C:/Downloads/PKU', language: 'zh' },
    state: { last_sync: '2023-10-27 10:00:00', total_files: 120 },
    courses: [],
    local_stats: { total: 150, courses: { '高等数学': 10, '大学物理': 5 } }
  }),
  load_config: async () => ({
    username: '',
    password: '',
    download_dir: 'C:/Downloads/PKU',
    browser: 'chrome',
    headless: true,
    concurrent_downloads: 3,
    language: 'zh'
  }),
  save_config: async () => ({ success: true }),
  login: async () => {
    setTimeout(() => window.syncComplete(), 2000);
  },
  sync_downloads: async () => {
    window.addLog('Starting sync...');
    setTimeout(() => {
        window.setCourses([
            { id: '1', name: 'Math', alias: '高等数学', skip: false },
            { id: '2', name: 'Physics', alias: '大学物理', skip: true }
        ]);
        window.syncComplete();
    }, 2000);
  },
  select_folder: async () => 'C:/New/Path',
  update_course_config: async () => true,
  get_sync_reports: async () => [], // Mock empty reports
  get_sync_report: async () => null,
  open_folder: async () => ({ success: true }),
  open_file: async () => ({ success: true }),
  logout: async () => ({ success: true }),
  stop_sync: async () => {},
  pause_sync: async () => ({ paused: true }),
  fetch_replays: async () => {
    setTimeout(() => window.replaysFetched?.('mock', [], null), 500);
  },
  download_replays_direct: async () => {
    setTimeout(() => window.replayDownloadFinished?.('mock', true, 'ok'), 500);
  },
  refresh_course_info: async () => {
    setTimeout(() => window.courseInfoRefreshed?.([], null), 800);
  }
};

// 🔑 安全的 API 访问函数
const getApi = () => {
  // 检查 pywebview 是否存在且 API 已注入
  if (window.pywebview && window.pywebview.api && typeof window.pywebview.api.get_init_state === 'function') {
    return window.pywebview.api;
  }
  // 开发模式或 API 未就绪时使用 mock
  return mockApi;
};

const replayKeyHelper = (replay) => replay?.replay_id || replay?.sub_title;

function CourseCard({ course, localCount, onUpdate, onOpenFolder, onOpenReplayCenter, lang }) {
    const [isEditing, setIsEditing] = useState(false);
    const [localAlias, setLocalAlias] = useState(course.alias || '');

    const handleSaveAlias = () => {
        onUpdate(course.id, { ...course, alias: localAlias });
        setIsEditing(false);
    };

    const toggleTab = (tab) => {
        const currentTabs = course.selected_tabs || [];
        const newTabs = currentTabs.includes(tab)
            ? currentTabs.filter(t => t !== tab)
            : [...currentTabs, tab];
        onUpdate(course.id, { ...course, selected_tabs: newTabs });
    };

    return (
        <motion.div 
            layout
            transition={{ 
                layout: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 }
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => onUpdate(course.id, { ...course, skip: !course.skip })}
            className={clsx(
                "group relative p-5 rounded-2xl border transition-[background-color,border-color,shadow,opacity,filter] duration-300 flex flex-col gap-4 cursor-pointer overflow-hidden",
                course.skip
                ? "bg-slate-100 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/50 opacity-60 hover:opacity-80 grayscale-[0.3]"
                : course.is_historical
                ? "bg-amber-50/80 dark:bg-amber-900/10 border-amber-200 dark:border-amber-700/50 hover:border-amber-400/50 hover:shadow-lg hover:shadow-amber-400/10 backdrop-blur-sm"
                : "bg-white/80 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/50 hover:border-neon-blue/50 hover:shadow-lg hover:shadow-neon-blue/10 backdrop-blur-sm"
            )}
        >
            {/* Background Gradient for Active State */}
            {!course.skip && !course.is_historical && (
                <div className="absolute inset-0 bg-gradient-to-br from-neon-blue/5 to-neon-purple/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            )}
            {!course.skip && course.is_historical && (
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            )}

            <div className="flex justify-between items-start relative z-10">
                <div className="flex items-center gap-2">
                    <div className={clsx(
                        "text-[10px] px-2 py-0.5 rounded-full font-mono border",
                        course.skip
                            ? "bg-slate-200 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700"
                            : course.is_historical
                            ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700"
                            : "bg-neon-blue/10 text-neon-blue border-neon-blue/20"
                    )}>
                        {course.id}
                    </div>
                    {course.is_historical && (
                        <div className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700 flex items-center gap-1">
                            <Archive className="w-3 h-3" />
                            {t('historicalCourse', lang)}
                        </div>
                    )}
                    {localCount !== undefined && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800/50 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700/50">
                            <FileText className="w-3 h-3" />
                            {localCount}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); onOpenFolder(course.id); }}
                        className={clsx(
                            "p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100",
                            course.skip
                                ? "hover:bg-slate-200 dark:hover:bg-slate-800"
                                : "hover:bg-neon-blue/10"
                        )}
                        title={t('openFolder', lang)}
                    >
                        <FolderOpen className={clsx(
                            "w-4 h-4",
                            course.skip ? "text-slate-400" : "text-neon-blue"
                        )} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onOpenReplayCenter(course.id); }}
                        className={clsx(
                            "p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100",
                            course.skip
                                ? "hover:bg-slate-200 dark:hover:bg-slate-800"
                                : "hover:bg-neon-purple/10"
                        )}
                        title={t('downloadReplays', lang)}
                    >
                        <Video className={clsx(
                            "w-4 h-4",
                            course.skip ? "text-slate-400" : "text-neon-purple"
                        )} />
                    </button>
                    <div className={clsx(
                        "w-2 h-2 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]",
                        course.skip ? "bg-slate-400 dark:bg-slate-600" : course.is_historical ? "bg-amber-400 shadow-amber-400/50" : "bg-green-400 shadow-green-400/50"
                    )} />
                </div>
            </div>

            <div className="relative z-10">
                <h3 className={clsx(
                    "font-bold text-lg line-clamp-1 tracking-tight transition-colors",
                    course.skip ? "text-slate-400" : "text-slate-800 dark:text-white group-hover:text-neon-blue"
                )} title={course.name}>
                    {course.name}
                </h3>

                <div className="flex items-center gap-2 h-6 mt-1">
                    {isEditing ? (
                        <input 
                            type="text" 
                            value={localAlias}
                            onChange={(e) => setLocalAlias(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            className="flex-1 bg-black/5 dark:bg-black/30 border border-slate-300 dark:border-slate-600 rounded px-2 py-0.5 text-xs focus:border-neon-blue outline-none text-slate-800 dark:text-white"
                            placeholder={t('alias', lang) + "..."}
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveAlias()}
                            onBlur={handleSaveAlias}
                        />
                    ) : (
                        <div 
                            className="flex items-center gap-2 group/edit cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 px-2 py-0.5 -ml-2 rounded transition-colors" 
                            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                        >
                            <span className={clsx("text-xs font-medium", course.alias ? "text-neon-purple" : "text-slate-500 italic")}>
                                {course.alias || t('alias', lang) + "..."}
                            </span>
                            <Edit2 className="w-3 h-3 text-slate-400 dark:text-slate-600 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                        </div>
                    )}
                </div>
            </div>

            {!course.skip && course.available_tabs && course.available_tabs.length > 0 && (
                <div className="mt-auto pt-3 border-t border-slate-200 dark:border-slate-700/30 relative z-10">
                    <div className="flex flex-wrap gap-1.5">
                        {course.available_tabs.map(tab => (
                            <button
                                key={tab}
                                onClick={(e) => { e.stopPropagation(); toggleTab(tab); }}
                                className={clsx(
                                    "text-[10px] px-2 py-0.5 rounded border transition-all duration-200",
                                    (course.selected_tabs || []).includes(tab)
                                        ? "bg-neon-blue/10 border-neon-blue/30 text-neon-blue shadow-[0_0_10px_rgba(59,130,246,0.1)]"
                                        : "bg-transparent border-slate-300 dark:border-slate-700/50 text-slate-500 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
                                )}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>
            )}

        </motion.div>
    );
}

const dedupeCoursesHelper = (list) => {
    const byId = new Map();
    for (const course of (list || [])) {
        const id = String(course?.id || '').trim();
        if (!id) continue;
        const existing = byId.get(id);
        if (!existing) {
            byId.set(id, course);
            continue;
        }
        if (existing.is_historical && !course.is_historical) {
            byId.set(id, course);
            continue;
        }
        const existingScore = Number(Boolean(existing.url)) + (existing.available_tabs || []).length;
        const currentScore = Number(Boolean(course.url)) + (course.available_tabs || []).length;
        if (currentScore > existingScore) {
            byId.set(id, course);
        }
    }
    return [...byId.values()];
};

// Helper for consistent sorting
const sortCoursesHelper = (list) => {
    return dedupeCoursesHelper(list).sort((a, b) => {
        // First: historical courses after current courses
        const aHist = a.is_historical ? 1 : 0;
        const bHist = b.is_historical ? 1 : 0;
        if (aHist !== bHist) return aHist - bHist;
        // Then sort by skip status (false/enabled first, true/disabled last)
        if (a.skip === b.skip) return 0;
        return a.skip ? 1 : -1;
    });
};

function StatsDropdown({ icon: Icon, label, value, children }) {
    const [isOpen, setIsOpen] = useState(false);
    
    return (
      <div 
        className="relative flex items-center gap-2 cursor-help group"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
      >
         <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-neon-blue transition-colors" />
         <span className="text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
            {label}: <span className="font-mono">{value}</span>
         </span>
         
         <AnimatePresence>
           {isOpen && (
             <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="absolute top-full right-0 mt-4 w-64 bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-4 z-50"
             >
                <div className="absolute -top-2 right-10 w-4 h-4 bg-white dark:bg-slate-800 border-t border-l border-slate-200 dark:border-slate-700 transform rotate-45" />
                <div className="relative z-10 max-h-60 overflow-y-auto custom-scrollbar">
                    {children}
                </div>
             </motion.div>
           )}
         </AnimatePresence>
      </div>
    )
}

function HelpModal({ onClose, lang }) {
    const isZh = lang === 'zh';
    const [theme, setTheme] = useState('dark'); // Get theme from parent or detect

    // Detect theme from document
    useEffect(() => {
        const isDark = document.documentElement.classList.contains('dark');
        setTheme(isDark ? 'dark' : 'light');
    }, []);

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-slate-700"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <HelpCircle className="w-5 h-5 text-neon-blue" />
                        {t('helpTitle', lang)}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 space-y-4 text-sm text-slate-600 dark:text-slate-300 max-h-[60vh] overflow-y-auto">
                    <div className="space-y-2">
                        <h4 className="font-bold text-slate-900 dark:text-white">1. {isZh ? '初始化设置' : 'Initial Setup'}</h4>
                        <p>{isZh ? '输入您的北大门户学号和密码。选择课程文件保存的下载目录。' : 'Enter your PKU Student ID and Password. Select a download directory where your course files will be saved.'}</p>
                    </div>
                    <div className="space-y-2">
                        <h4 className="font-bold text-slate-900 dark:text-white">2. {isZh ? '同步课程' : 'Syncing'}</h4>
                        <p>{isZh ? '点击“立即同步”以获取最新的课程列表。这可能需要一点时间。' : 'Click "SYNC NOW" to fetch your latest course list from the portal. This may take a few moments.'}</p>
                    </div>
                    <div className="space-y-2">
                        <h4 className="font-bold text-slate-900 dark:text-white">3. {isZh ? '管理课程' : 'Managing Courses'}</h4>
                        <ul className="list-disc pl-5 space-y-1">
                            <li><strong>{isZh ? '启用/禁用' : 'Enable/Disable'}:</strong> {isZh ? '点击课程卡片以切换是否自动下载。' : 'Click a course card to toggle auto-downloading.'}</li>
                            <li><strong>{isZh ? '别名' : 'Aliases'}:</strong> {isZh ? '点击“别名”文本可自定义课程显示的名称。' : 'Click the "Set Alias" text to rename a course locally.'}</li>
                            <li><strong>{isZh ? '标签页' : 'Tabs'}:</strong> {isZh ? '选择特定的标签页（如“作业”、“资源”）以仅下载所需内容。' : 'Select specific tabs (e.g., "Homework", "Resources") to download only what you need.'}</li>
                        </ul>
                    </div>
                    <div className="space-y-2">
                        <h4 className="font-bold text-slate-900 dark:text-white">4. {isZh ? '日志与状态' : 'Logs & Status'}</h4>
                        <p>{isZh ? '查看底部面板的实时日志。将鼠标悬停在顶部标题统计信息上，可查看同步历史记录和文件分布。' : 'Check the bottom panel for real-time logs. Hover over the header stats to see sync history and file distribution.'}</p>
                    </div>
                </div>
                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="text-center">
                        <button
                            onClick={onClose}
                            className="bg-neon-blue hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                        >
                            {isZh ? '知道了' : 'Got it'}
                        </button>
                    </div>
                    <BrandFooter theme={theme} showGithub={true} showAuthor={true} />
                </div>
            </motion.div>
        </motion.div>
    );
}

function ReplayModal({
    course,
    replays,
    selectedKeys,
    isLoading,
    isDownloading,
    onToggleReplay,
    onSelectAll,
    onClearAll,
    onRefresh,
    onDownload,
    onClose,
    lang,
}) {
    const selectedSet = new Set(selectedKeys || []);
    const selectedCount = selectedSet.size;

    const replayKey = (replay) => replay.replay_id || replay.sub_title;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full h-[80vh] border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-900/50">
                    <Video className="w-5 h-5 text-neon-purple" />
                    <div className="min-w-0">
                        <div className="text-sm text-slate-500 dark:text-slate-400">{t('downloadReplays', lang)}</div>
                        <div className="font-bold text-slate-900 dark:text-white truncate">{course?.name || ''}</div>
                    </div>
                    <button
                        onClick={onRefresh}
                        disabled={isLoading || isDownloading}
                        className="ml-auto px-3 py-1.5 rounded-lg border border-neon-purple/30 text-neon-purple bg-neon-purple/10 hover:bg-neon-purple/20 disabled:opacity-60 text-sm"
                    >
                        <RefreshCw className={clsx("w-3.5 h-3.5 inline-block mr-1.5", isLoading && "animate-spin")} />
                        {isLoading ? t('fetchingReplays', lang) : t('fetchReplayList', lang)}
                    </button>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                        <X className="w-4 h-4 text-slate-500" />
                    </button>
                </div>

                <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs">
                    <button onClick={onSelectAll} className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700">
                        {lang === 'zh' ? '全选' : 'Select All'}
                    </button>
                    <button onClick={onClearAll} className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700">
                        {lang === 'zh' ? '清空' : 'Clear'}
                    </button>
                    <span className="ml-auto text-slate-500 dark:text-slate-400">
                        {selectedCount}/{replays.length} {lang === 'zh' ? '已选' : 'selected'}
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50/30 dark:bg-slate-900/20">
                    {replays.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-slate-500 dark:text-slate-400 text-sm">
                            {isLoading ? t('fetchingReplays', lang) : t('noReplays', lang)}
                        </div>
                    ) : (
                        replays.map((replay) => {
                            const key = replayKey(replay);
                            const checked = selectedSet.has(key);
                            return (
                                <button
                                    key={key}
                                    onClick={() => onToggleReplay(key)}
                                    className={clsx(
                                        "w-full text-left p-3 rounded-xl border transition-colors",
                                        checked
                                            ? "bg-neon-purple/10 border-neon-purple/40"
                                            : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={clsx(
                                            "w-4 h-4 rounded border flex items-center justify-center",
                                            checked ? "border-neon-purple bg-neon-purple text-white" : "border-slate-400"
                                        )}>
                                            {checked && <Check className="w-3 h-3" />}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-medium text-slate-900 dark:text-white truncate">{replay.sub_title}</div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                                {replay.lecturer_name || '-'} · {replay.filename}
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>

                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                    >
                        {t('cancel', lang)}
                    </button>
                    <button
                        onClick={onDownload}
                        disabled={isDownloading || selectedCount === 0}
                        className="px-4 py-2 rounded-lg bg-neon-purple text-white font-medium hover:bg-purple-600 disabled:opacity-60"
                    >
                        {isDownloading ? (lang === 'zh' ? '下载中...' : 'Downloading...') : (lang === 'zh' ? '下载选中回放' : 'Download Selected')}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

// Brand Footer Component - Shows project info with GitHub link
function BrandFooter({ theme, showGithub = true, showAuthor = true }) {
    const brandName = theme === 'dark' ? 'PKU-Get' : '未名拾课';

    return (
        <div className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500 space-y-2">
            <p className="font-semibold text-slate-600 dark:text-slate-300">
                {brandName} v2.5
            </p>
            {showAuthor && (
                <p>
                    Made with ❤️ by{' '}
                    <span className="text-neon-purple font-medium">Robin</span>
                    {showGithub && (
                        <>
                            {' '}(
                            <a
                                href="https://github.com/robin0505"
                                className="text-neon-blue hover:underline"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                @robin0505
                            </a>
                            )
                        </>
                    )}
                </p>
            )}
            {showGithub && (
                <a
                    href="https://github.com/robin0505/PKU-Get"
                    className="inline-flex items-center gap-1 text-neon-blue hover:underline transition-colors"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <Github className="w-3 h-3" />
                    View on GitHub
                </a>
            )}
        </div>
    );
}

function App() {
  const [view, setView] = useState('loading');
  const [config, setConfig] = useState({
    username: '',
    password: '',
    download_dir: '',
    browser: 'chrome',
    headless: true,
    concurrent_downloads: 3,
    auto_sync: true,
    language: 'zh'  // 🔑 默认语言设为中文
  });
  const [courses, setCourses] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshingInfo, setIsRefreshingInfo] = useState(false);
  const [runtimeState, setRuntimeState] = useState({ last_sync: 'Never', total_files: 0 });
  const [localStats, setLocalStats] = useState({ total: 0, courses: {} });
  const [previousView, setPreviousView] = useState(null);
  const [theme, setTheme] = useState('dark');
  const [syncHistory, setSyncHistory] = useState([]);
  const [showHelp, setShowHelp] = useState(false);

  // Sync report states
  const [syncReports, setSyncReports] = useState([]);
  const [showSyncReport, setShowSyncReport] = useState(false);
  const [currentReport, setCurrentReport] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Progress tracking state
  const [progressData, setProgressData] = useState(null);
  const [isProgressExpanded, setIsProgressExpanded] = useState(false); // 默认收起
  const [isPaused, setIsPaused] = useState(false);
  const [fetchingReplayId, setFetchingReplayId] = useState(null);
  const [replayModalCourseId, setReplayModalCourseId] = useState(null);
  const [replaySelectionByCourse, setReplaySelectionByCourse] = useState({});
  const [replayDownloadingCourseId, setReplayDownloadingCourseId] = useState(null);
  const [showHistorical, setShowHistorical] = useState(false);

  // Log resize state
  const [logHeight, setLogHeight] = useState(200);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const isDraggingLog = useRef(false);
  const logsEndRef = useRef(null);
  const sortTimeoutRef = useRef(null);
  const hasInitialized = useRef(false);  // Guard to prevent multiple initializations
  const initEventHandlerRef = useRef(null);  // Store event handler for cleanup
  const initFallbackTimeoutRef = useRef(null);  // Store fallback timeout for cleanup

  // Convenience accessor for language
  const lang = config.language || 'zh';
  const replayModalCourse = useMemo(
      () => courses.find(c => c.id === replayModalCourseId) || null,
      [courses, replayModalCourseId]
  );
  const replayModalReplays = replayModalCourse?.available_replays || [];
  const replayModalSelected = replayModalCourseId ? (replaySelectionByCourse[replayModalCourseId] || []) : [];

  useEffect(() => {
    // Apply theme to document
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    // Setup Python callbacks
    window.addLog = (msg) => setLogs(prev => [...prev, msg].slice(-100));
    window.setCourses = (data) => setCourses(sortCoursesHelper(data));
    window.updateProgress = (data) => {
      setProgressData(data);
      // Track paused state from backend
      if (data.phase === 'paused') {
        setIsPaused(true);
      } else if (data.phase === 'downloading' || data.phase === 'scanning') {
        setIsPaused(false);
      }
      // When complete, clear progress data
      if (data.phase === 'complete') {
        setIsPaused(false);
        setTimeout(() => setProgressData(null), 2000); // Clear after 2s
      }
    };
    window.syncComplete = () => {
        setIsSyncing(false);
        setIsPaused(false);
        setProgressData(null); // Clear progress on complete
        setView('dashboard');
        // Refresh stats after sync
        getApi().get_init_state().then(data => {
            setRuntimeState(data.state);
            setLocalStats(data.local_stats);
            // Update history
            if (data.state.last_sync && data.state.last_sync !== 'Never') {
                setSyncHistory(prev => {
                    const newHistory = [data.state.last_sync, ...prev];
                    return [...new Set(newHistory)].slice(10); // Keep last 10 unique
                });
            }
            // 🔑 更新课程列表（如果有新数据）
            if (data.courses && data.courses.length > 0) {
                setCourses(sortCoursesHelper(data.courses));
            }
        });

        // Load sync reports and show latest
        getApi().get_sync_reports(20).then(reports => {
            setSyncReports(reports);
            if (reports && reports.length > 0) {
                // Load full report details
                const latestSyncId = reports[0].sync_id;
                getApi().get_sync_report(latestSyncId).then(fullReport => {
                    setCurrentReport(fullReport);
                    setShowSyncReport(true);
                });
            }
        }).catch(err => {
            console.error('Failed to load sync reports:', err);
        });
    };
    window.replaysFetched = (courseId, replays, error) => {
        setFetchingReplayId(null);
        if (error) {
            console.error('Failed to fetch replays:', error);
            return;
        }
        if (replays) {
            const seen = new Set();
            const deduped = replays.filter((replay) => {
                const key = replayKeyHelper(replay);
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            setCourses(prev => prev.map(c =>
                c.id === courseId ? { ...c, available_replays: deduped } : c
            ));
            setReplaySelectionByCourse(prev => {
                if (prev[courseId]) return prev;
                return { ...prev, [courseId]: deduped.map(replayKeyHelper) };
            });
        }
    };
    window.replayDownloadFinished = (courseId, success, message) => {
        setReplayDownloadingCourseId(null);
        if (success) {
            window.addLog?.(`[INFO] ${message || 'Replay download finished'}`);
        } else {
            window.addLog?.(`[ERROR] ${message || 'Replay download failed'}`);
            alert(message || 'Replay download failed');
        }
    };
    window.courseInfoRefreshed = (updatedCourses, error) => {
        setIsRefreshingInfo(false);
        if (error) {
            window.addLog?.(`[ERROR] Refresh course info failed: ${error}`);
            alert('Refresh failed: ' + error);
            return;
        }
        if (updatedCourses && updatedCourses.length > 0) {
            setCourses(sortCoursesHelper(updatedCourses));
        }
        window.addLog?.('[INFO] Course info refreshed successfully.');
    };
    window.syncFailed = (err) => {
        setIsSyncing(false);
        setIsPaused(false);
        setProgressData(null); // Clear progress on failure
        alert('Sync Failed: ' + err);

        // 🔑 增强错误处理：如果是认证相关错误，跳转到登录页
        const errorLower = (err || '').toLowerCase();
        const isAuthError = errorLower.includes('credentials') ||
                           errorLower.includes('login') ||
                           errorLower.includes('auth') ||
                           errorLower.includes('password') ||
                           errorLower.includes('username');

        if (isAuthError) {
            // 清除课程数据并跳转到登录页
            setCourses([]);
            setView('login');
            setLogs(prev => [...prev, '[ERROR] Authentication failed, please login again']);
        }
    };

    // Initial Load - Wait for pywebview to be ready
    const initApp = () => {
      // 🛡️ Guard: Prevent multiple initializations
      if (hasInitialized.current) {
        console.log('Already initialized, skipping...');
        return;
      }

      // 🔑 确保 API 完全可用后再调用
      const api = getApi();
      if (!api || typeof api.get_init_state !== 'function') {
        console.warn('API not ready, retrying...');
        setTimeout(initApp, 100); // 100ms 后重试
        return;
      }

      api.get_init_state().then(data => {
          // Mark as initialized immediately after successful API call
          hasInitialized.current = true;
          console.log('Initialization complete, marked as initialized');

          // 🧹 Cleanup: Remove event listener and clear fallback timeout
          if (initEventHandlerRef.current) {
            window.removeEventListener('pywebviewready', initEventHandlerRef.current);
            initEventHandlerRef.current = null;
            console.log('Cleaned up pywebviewready event listener');
          }
          if (initFallbackTimeoutRef.current) {
            clearTimeout(initFallbackTimeoutRef.current);
            initFallbackTimeoutRef.current = null;
            console.log('Cleaned up fallback timeout');
          }

          setView(data.view);
          setConfig(data.config);
          setRuntimeState(data.state);
          setLocalStats(data.local_stats);

          // Init history with current last_sync
          if (data.state.last_sync && data.state.last_sync !== 'Never') {
              setSyncHistory([data.state.last_sync]);
          }

          // 🔑 加载已保存的课程列表
          if (data.courses) {
              setCourses(sortCoursesHelper(data.courses));
          }

          // 🔑 自动同步功能
          if (data.should_auto_sync) {
              console.log('Auto-sync enabled, starting sync...');
              setTimeout(() => {
                  handleSync();
              }, 1000);  // 延迟1秒让UI完全加载
          }
      }).catch(err => {
          console.error('Failed to load initial state:', err);
          // Fallback to login view on error
          setView('login');
      });
    };

    // 🔑 多种方式确保 API 就绪
    if (window.pywebview && window.pywebview.api && typeof window.pywebview.api.get_init_state === 'function') {
      // pywebview API 已经完全就绪
      console.log('pywebview API ready, initializing...');
      initApp();
    } else {
      // 等待 pywebviewready 事件
      console.log('Waiting for pywebviewready event...');
      const handleReady = () => {
        console.log('pywebviewready event received');
        // 给 API 注入一点额外时间
        setTimeout(initApp, 50);
      };

      // Store handler in ref for cleanup
      initEventHandlerRef.current = handleReady;
      window.addEventListener('pywebviewready', handleReady);

      // 后备方案：1秒后强制尝试
      initFallbackTimeoutRef.current = setTimeout(() => {
        console.log('Fallback: forcing init after timeout');
        initApp();
      }, 1000);

      return () => {
        // Cleanup on unmount (if component unmounts before init)
        if (initEventHandlerRef.current) {
          window.removeEventListener('pywebviewready', initEventHandlerRef.current);
        }
        if (initFallbackTimeoutRef.current) {
          clearTimeout(initFallbackTimeoutRef.current);
        }
      };
    }
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Real-time local file stats update during sync
  useEffect(() => {
    let intervalId;

    if (progressData && (progressData.phase === 'downloading' || progressData.phase === 'paused' || progressData.phase === 'scanning')) {
      // Update local stats every 3 seconds during download
      intervalId = setInterval(() => {
        getApi().get_init_state().then(data => {
          if (data.local_stats) {
            setLocalStats(data.local_stats);
          }
        }).catch(err => {
          console.error('Failed to update local stats:', err);
        });
      }, 3000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [progressData]);

  // Log resize handler
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingLog.current) return;
      e.preventDefault(); // Prevent selection
      const newHeight = window.innerHeight - e.clientY;
      
      if (newHeight < 60) {
        setIsLogOpen(false);
        isDraggingLog.current = false;
        document.body.style.cursor = 'default';
      } else {
        const maxHeight = window.innerHeight * 0.8;
        setLogHeight(Math.min(Math.max(newHeight, 100), maxHeight));
      }
    };

    const handleMouseUp = () => {
      isDraggingLog.current = false;
      document.body.style.cursor = 'default';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResizing = () => {
      isDraggingLog.current = true;
      document.body.style.cursor = 'row-resize';
  };

  // Cleanup sort timeout on unmount
  useEffect(() => {
      return () => {
          if (sortTimeoutRef.current) clearTimeout(sortTimeoutRef.current);
      };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsSyncing(true);
    await getApi().login(config);
  };

  // Auto-save config when changed (debounced)
  const configSaveTimeoutRef = useRef(null);

  const handleConfigChange = (newConfig) => {
      setConfig(newConfig);

      // Debounce save to avoid too many API calls
      if (configSaveTimeoutRef.current) clearTimeout(configSaveTimeoutRef.current);
      configSaveTimeoutRef.current = setTimeout(async () => {
          await getApi().save_config(newConfig);
      }, 300);
  };

  const handleFetchReplays = async (courseId) => {
      setFetchingReplayId(courseId);
      await getApi().fetch_replays(courseId);
  };

  const handleOpenReplayCenter = async (courseId) => {
      setReplayModalCourseId(courseId);
      const target = courses.find(c => c.id === courseId);
      const hasList = target?.available_replays && target.available_replays.length > 0;
      if (!hasList) {
          await handleFetchReplays(courseId);
      } else {
          setReplaySelectionByCourse(prev => {
              if (prev[courseId]) return prev;
              return { ...prev, [courseId]: target.available_replays.map(replayKeyHelper) };
          });
      }
  };

  const handleToggleReplaySelection = (courseId, replayKey) => {
      setReplaySelectionByCourse(prev => {
          const current = new Set(prev[courseId] || []);
          if (current.has(replayKey)) current.delete(replayKey);
          else current.add(replayKey);
          return { ...prev, [courseId]: [...current] };
      });
  };

  const handleDownloadReplaysDirect = async () => {
      if (!replayModalCourseId) return;
      const selected = replaySelectionByCourse[replayModalCourseId] || [];
      if (selected.length === 0) return;

      setReplayDownloadingCourseId(replayModalCourseId);
      await getApi().download_replays_direct(replayModalCourseId, selected);
  };

  const handleSaveSettings = async (e) => {
      e.preventDefault();
      // Save immediately and go back
      await getApi().save_config(config);
      setView('dashboard');
  };

  const handleSync = async () => {
    // 🛡️ Guard: Prevent concurrent sync operations
    if (isSyncing) {
      console.log('Sync already in progress, skipping...');
      return;
    }

    setIsSyncing(true);
    await getApi().sync_downloads();
  };

  const handleRefreshCourseInfo = async () => {
    if (isRefreshingInfo || isSyncing) return;
    setIsRefreshingInfo(true);
    await getApi().refresh_course_info();
  };

  const handlePauseSync = async () => {
    const result = await getApi().pause_sync();
    setIsPaused(result.paused);
  };

  const handleStopSync = async () => {
    await getApi().stop_sync();
    // syncComplete() will be called by backend naturally when download finishes
  };

  const handleUpdateCourse = async (courseId, newConfig) => {
      // 1. Update state immediately (in place, preserving order)
      setCourses(prev => prev.map(c => c.id === courseId ? newConfig : c));
      
      // 2. Call API
      await getApi().update_course_config(courseId, {
          alias: newConfig.alias,
          selected_tabs: newConfig.selected_tabs,
          skip: newConfig.skip
      });

      // 3. Schedule a delayed re-sort if skip status changed
      // We use a timeout to let the user see the visual state change first
      if (sortTimeoutRef.current) clearTimeout(sortTimeoutRef.current);
      
      sortTimeoutRef.current = setTimeout(() => {
          setCourses(prev => sortCoursesHelper(prev));
      }, 800); // 800ms delay for better UX
  };

  const handleToggleAll = async (enable) => {
      const newSkip = !enable;
      const newCourses = courses.map(c => ({ ...c, skip: newSkip }));
      // For bulk action, we can sort immediately or keep order.
      // Sorting immediately makes sense here as it's a "reset" action.
      setCourses(sortCoursesHelper(newCourses));

      for (const course of newCourses) {
          await getApi().update_course_config(course.id, { ...course, skip: newSkip });
      }
  };

  const handleLogout = async () => {
      // 🔑 退出登录处理
      const confirmLogout = window.confirm(
          lang === 'zh'
              ? '确定要退出登录吗？这将清除所有登录数据和课程缓存。'
              : 'Are you sure you want to logout? This will clear all login data and course cache.'
      );

      if (!confirmLogout) return;

      try {
          const result = await getApi().logout();
          if (result.success) {
              // 清除前端状态
              setCourses([]);
              setConfig({
                  username: '',
                  password: '',
                  download_dir: config.download_dir,  // 保留下载目录
                  browser: config.browser,  // 保留浏览器设置
                  headless: config.headless,
                  concurrent_downloads: config.concurrent_downloads,
                  auto_sync: false,
                  language: config.language,
                  show_history_toggle: config.show_history_toggle,
                  include_history: config.include_history,
              });
              setRuntimeState({ last_sync: 'Never', total_files: 0 });
              // 跳转到登录页
              setView('login');
              setLogs(prev => [...prev, '[INFO] Logged out successfully']);
          } else {
              alert(t('failed', lang) + ': ' + (result.error || 'Unknown error'));
          }
      } catch (error) {
          console.error('Logout error:', error);
          alert(t('failed', lang) + ': ' + error.message);
      }
  };

useEffect(() => {
  // 🔑 注册 macOS 文件夹选择回调
  window.handleFolderSelected = (folder) => {
    if (folder) {
      handleConfigChange({ ...config, download_dir: folder });
      setLogs(prev => [...prev, `[INFO] Folder selected: ${folder}`]);
    } else {
      setLogs(prev => [...prev, '[INFO] Folder selection cancelled']);
    }
  };
  
  return () => {
    delete window.handleFolderSelected;
  };
}, [config, handleConfigChange, setLogs]);

const selectFolder = async () => {
  try {
    const isMac = navigator.platform.includes('Mac');
    
    if (isMac) {
      // macOS: 异步模式，等待 window.handleFolderSelected 回调
      setLogs(prev => [...prev, '[INFO] Opening folder selector (native macOS dialog)...']);
      await getApi().select_folder(); // 会立即返回 null
    } else {
      // Windows/Linux: 同步模式
      const folder = await getApi().select_folder();
      if (folder) {
        handleConfigChange({ ...config, download_dir: folder });
      }
    }
  } catch (error) {
    console.error('Folder selection failed:', error);
    setLogs(prev => [...prev, `[ERROR] Folder selection failed: ${error}`]);
  }
};

  const handleOpenFile = async (courseId, fileName, fallbackCourseName) => {
    try {
      // Find current course folder name by ID (handles alias changes)
      let courseFolderName = fallbackCourseName;

      if (courseId && courseId !== 'unknown') {
        const course = courses.find(c => c.id === courseId);
        if (course) {
          courseFolderName = course.alias || course.name;
        }
      }

      const filePath = `${config.download_dir}/${courseFolderName}/${fileName}`;
      const result = await getApi().open_file(filePath);

      if (!result.success) {
        alert(`${t('failed', lang)}: ${result.error}`);
      }
    } catch (error) {
      console.error('Error opening file:', error);
      alert(t('failed', lang));
    }
  };

  const handleOpenFolder = async (courseNameOrId) => {
    try {
      // If it's a course ID, find the current folder name
      let courseFolderName = courseNameOrId;

      // Check if it's a course ID (not a folder name)
      const course = courses.find(c => c.id === courseNameOrId);
      if (course) {
        courseFolderName = course.alias || course.name;
      }

      const result = await getApi().open_folder(courseFolderName);

      if (!result.success) {
        alert(`${t('failed', lang)}: ${result.error}`);
      }
    } catch (error) {
      console.error('Error opening folder:', error);
      alert(t('failed', lang));
    }
  };

  if (view === 'loading') {
      return <div className="min-h-screen bg-slate-50 dark:bg-cyber-black flex items-center justify-center text-neon-blue">{t('loading', lang)}</div>;
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-white flex flex-col font-sans selection:bg-neon-blue selection:text-white relative transition-colors duration-300">
      <AnimatePresence>
        {showHelp && <HelpModal onClose={() => setShowHelp(false)} lang={lang} />}
      </AnimatePresence>
      <AnimatePresence>
        {replayModalCourse && (
            <ReplayModal
                course={replayModalCourse}
                replays={replayModalReplays}
                selectedKeys={replayModalSelected}
                isLoading={fetchingReplayId === replayModalCourse.id}
                isDownloading={replayDownloadingCourseId === replayModalCourse.id}
                onToggleReplay={(key) => handleToggleReplaySelection(replayModalCourse.id, key)}
                onSelectAll={() => setReplaySelectionByCourse(prev => ({
                    ...prev,
                    [replayModalCourse.id]: replayModalReplays.map(replayKeyHelper),
                }))}
                onClearAll={() => setReplaySelectionByCourse(prev => ({ ...prev, [replayModalCourse.id]: [] }))}
                onRefresh={() => handleFetchReplays(replayModalCourse.id)}
                onDownload={handleDownloadReplaysDirect}
                onClose={() => setReplayModalCourseId(null)}
                lang={lang}
            />
        )}
      </AnimatePresence>
      {/* Ambient Background Effects */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-neon-blue/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-neon-purple/5 rounded-full blur-[120px]" />
      </div>
      
      {/* Header */}
      <header className="h-16 border-b border-slate-200 dark:border-slate-800/50 flex items-center px-6 bg-white/80 dark:bg-[#0B1120]/80 backdrop-blur-xl fixed w-full z-50 shadow-sm transition-colors duration-300">
        <div className="flex items-center gap-2 text-neon-blue">
          <Download className="w-6 h-6" />
          <span className="font-bold text-xl tracking-wider">{theme === 'dark' ? 'PKU-Get' : '未名拾课'}</span>
        </div>
        <div className="ml-auto flex items-center gap-6 text-sm">
            {view === 'dashboard' && (
                <>
                    <StatsDropdown
                        icon={Clock}
                        label={t('lastSync', lang)}
                        value={runtimeState.last_sync}
                    >
                        <div className="space-y-2">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                {lang === 'zh' ? '本次会话记录' : 'Session History'}
                            </h4>
                            {syncHistory.length === 0 ? (
                                <div className="text-xs text-slate-500 italic">
                                    {lang === 'zh' ? '本次会话暂无同步记录' : 'No syncs recorded this session'}
                                </div>
                            ) : (
                                syncHistory.map((time, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                        <div className="w-1.5 h-1.5 rounded-full bg-neon-blue" />
                                        {time}
                                    </div>
                                ))
                            )}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    // Load reports and open modal
                                    getApi().get_sync_reports(20).then(reports => {
                                        setSyncReports(reports);
                                        setShowHistoryModal(true);
                                    });
                                }}
                                className="w-full mt-3 py-2 px-3 bg-neon-blue/10 hover:bg-neon-blue/20 text-neon-blue rounded-lg transition-colors text-xs font-bold flex items-center justify-center gap-2"
                            >
                                <FileText className="w-3 h-3" />
                                {t('viewSyncHistory', lang)}
                            </button>
                        </div>
                    </StatsDropdown>

                    <StatsDropdown 
                        icon={HardDrive} 
                        label={t('totalFiles', lang)} 
                        value={localStats.total}
                    >
                        <div className="space-y-2">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                {lang === 'zh' ? '文件分布' : 'File Distribution'}
                            </h4>
                            {Object.keys(localStats.courses).length === 0 ? (
                                <div className="text-xs text-slate-500 italic">
                                    {lang === 'zh' ? '未找到文件' : 'No files found'}
                                </div>
                            ) : (
                                Object.entries(localStats.courses)
                                    .filter(([_, count]) => count > 0)
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([name, count]) => (
                                        <div key={name} className="flex justify-between items-center text-xs group/item">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenFolder(name);
                                                }}
                                                className="text-slate-600 dark:text-slate-300 hover:text-neon-blue dark:hover:text-neon-blue truncate max-w-[140px] transition-colors cursor-pointer text-left flex items-center gap-1"
                                                title={`${lang === 'zh' ? '点击打开：' : 'Click to open: '}${name}`}
                                            >
                                                <FolderOpen className="w-3 h-3 opacity-0 group-hover/item:opacity-100 transition-opacity flex-shrink-0" />
                                                <span className="truncate">{name}</span>
                                            </button>
                                            <span className="font-mono text-neon-blue bg-neon-blue/10 px-1.5 py-0.5 rounded">{count}</span>
                                        </div>
                                    ))
                            )}
                        </div>
                    </StatsDropdown>
                </>
            )}

            {view !== 'loading' && (
                <>
                    <button 
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                        title="Toggle Theme"
                    >
                        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </button>
                    <button 
                        onClick={() => setShowHelp(true)}
                        className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                        title={t('help', lang)}
                    >
                        <HelpCircle className="w-4 h-4" />
                    </button>
                </>
            )}

            <div className={clsx("flex items-center gap-2", isSyncing ? "text-green-500 dark:text-green-400 animate-pulse" : "text-slate-500")}>
                <div className={clsx("w-2 h-2 rounded-full", isSyncing ? "bg-green-500 dark:bg-green-400" : "bg-slate-400 dark:bg-slate-600")} />
                {isSyncing ? t('syncing', lang) : "IDLE"}
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pt-20 px-6 overflow-y-auto" style={{ paddingBottom: isLogOpen ? logHeight + 20 : 100 }}>
        <AnimatePresence mode="wait">
          
          {view === 'login' && (
            <motion.div 
              key="login"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md mx-auto mt-20"
            >
              <div className="bg-white/80 dark:bg-cyber-gray/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 shadow-2xl backdrop-blur-sm transition-colors duration-300">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-neon-blue to-neon-purple bg-clip-text text-transparent">
                    {t('loginTitle', lang)}
                    </h2>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                    {t('loginSubtitle', lang)}
                </p>
                
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">{t('username', lang)}</label>
                    <input 
                      type="text" 
                      value={config.username}
                      onChange={e => setConfig({...config, username: e.target.value})}
                      onFocus={(e) => e.target.placeholder = ''}
                      onBlur={(e) => e.target.placeholder = t('username', lang)}
                      className="w-full bg-slate-50 dark:bg-cyber-black border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 focus:border-neon-blue outline-none text-slate-900 dark:text-white transition-colors placeholder-slate-300 dark:placeholder-slate-600"
                      placeholder={t('username', lang)}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">{t('password', lang)}</label>
                    <input 
                      type="password" 
                      value={config.password}
                      onChange={e => setConfig({...config, password: e.target.value})}
                      onFocus={(e) => e.target.placeholder = ''}
                      onBlur={(e) => e.target.placeholder = '••••••••'}
                      className="w-full bg-slate-50 dark:bg-cyber-black border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 focus:border-neon-blue outline-none text-slate-900 dark:text-white transition-colors placeholder-slate-300 dark:placeholder-slate-600"
                      placeholder="••••••••"
                    />
                  </div>

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-700/50">
                    <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">{t('downloadDir', lang)}</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={config.download_dir}
                        className="flex-1 bg-slate-50 dark:bg-cyber-black/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-500 dark:text-slate-400 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={selectFolder}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        <Folder className="w-5 h-5 text-neon-purple" />
                      </button>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-700/50">
                    <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">{t('browser', lang)}</label>
                    <select
                        value={config.browser}
                        onChange={e => setConfig({...config, browser: e.target.value})}
                        className="w-full bg-slate-50 dark:bg-cyber-black border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:border-neon-blue outline-none text-slate-900 dark:text-white transition-colors cursor-pointer text-sm"
                    >
                        <option value="chrome">{t('browserChrome', lang)}</option>
                        <option value="firefox">{t('browserFirefox', lang)}</option>
                        <option value="edge">{t('browserEdge', lang)}</option>
                        <option value="safari">{t('browserSafari', lang)}</option>
                    </select>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {config.browser === 'safari'
                            ? t('safariWarning', lang)
                            : config.browser === 'edge'
                            ? t('edgeInfo', lang)
                            : config.browser === 'firefox'
                            ? t('firefoxInfo', lang)
                            : t('chromeInfo', lang)
                        }
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-700/50">
                     <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">{t('language', lang)}</label>
                     <select
                        value={config.language}
                        onChange={e => handleConfigChange({...config, language: e.target.value})}
                        className="w-full bg-slate-50 dark:bg-cyber-black border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:border-neon-blue outline-none text-slate-900 dark:text-white transition-colors cursor-pointer text-sm"
                     >
                        <option value="en">English</option>
                        <option value="zh">简体中文</option>
                     </select>
                  </div>

                  <button 
                    type="submit" 
                    disabled={isSyncing}
                    className="w-full bg-neon-blue hover:bg-blue-600 text-white font-bold py-3 rounded-lg mt-6 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                  >
                    {isSyncing ? <RefreshCw className="animate-spin w-5 h-5" /> : <LogIn className="w-5 h-5" />}
                    {isSyncing ? t('loggingIn', lang) : t('loginButton', lang)}
                  </button>
                </form>

                <BrandFooter theme={theme} showGithub={true} showAuthor={true} />
              </div>
            </motion.div>
          )}

          {view === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-6xl mx-auto"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white">{t('dashboard', lang)}</h2>
                    <div className="flex gap-4 items-center mt-1">
                        <p className="text-slate-500 dark:text-slate-400">{lang === 'zh' ? '选择你想要同步的课程及其模块' : 'Manage your subscriptions and local files'}</p>
                        {courses.length > 0 && (
                            <div className="flex gap-2 text-xs">
                                <button 
                                    onClick={() => handleToggleAll(true)}
                                    className="text-neon-blue hover:text-blue-600 dark:hover:text-white transition-colors"
                                >
                                    {lang === 'zh' ? '全部启用' : 'Enable All'}
                                </button>
                                <span className="text-slate-300 dark:text-slate-600">|</span>
                                <button 
                                    onClick={() => handleToggleAll(false)}
                                    className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
                                >
                                    {lang === 'zh' ? '全部禁用' : 'Disable All'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setView('settings')}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-transparent hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all shadow-sm"
                    >
                        <Settings className="w-4 h-4" />
                        {t('settings', lang)}
                    </button>
                    <button
                        onClick={handleRefreshCourseInfo}
                        disabled={isRefreshingInfo || isSyncing}
                        title={t('refreshCourseInfoTooltip', lang)}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all shadow-sm disabled:opacity-50"
                    >
                        <RefreshCw className={clsx("w-4 h-4 text-neon-purple", isRefreshingInfo && "animate-spin")} />
                        {isRefreshingInfo ? t('refreshingCourseInfo', lang) : t('refreshCourseInfo', lang)}
                    </button>
                    <button 
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="bg-neon-blue hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                    >
                        {isSyncing ? <RefreshCw className="animate-spin w-5 h-5" /> : <RefreshCw className="w-5 h-5" />}
                        {t('syncNow', lang)}
                    </button>
                </div>
              </div>

              {(() => {
                  const currentCourses = courses.filter(c => !c.is_historical);
                  const historicalCourses = courses.filter(c => c.is_historical);
                  const hasHistorical = historicalCourses.length > 0;

                  return (
                    <>
                      {/* Current Courses */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {currentCourses.length === 0 && !hasHistorical ? (
                              <div className="col-span-full text-center py-20 text-slate-400 dark:text-slate-500">
                                  <p className="text-xl">{t('noCoursesSelected', lang)}</p>
                                  <p className="text-sm mt-2">{t('syncNow', lang)}</p>
                              </div>
                          ) : (
                            <AnimatePresence mode="popLayout">
                                {currentCourses.map(course => (
                                <CourseCard
                                    key={course.id}
                                    course={course}
                                    localCount={localStats.courses[course.name] || localStats.courses[course.alias]}
                                    onUpdate={handleUpdateCourse}
                                    onOpenFolder={handleOpenFolder}
                                    onOpenReplayCenter={handleOpenReplayCenter}
                                    lang={lang}
                                />
                                ))}
                            </AnimatePresence>
                          )}
                      </div>

                      {/* Historical Courses Section */}
                      {hasHistorical && (
                          <div className="mt-8 pb-20">
                              <button
                                  onClick={() => setShowHistorical(!showHistorical)}
                                  className="w-full flex items-center gap-3 mb-4 group"
                              >
                                  <div className="flex items-center gap-2">
                                      <Archive className="w-5 h-5 text-amber-500" />
                                      <h3 className="text-lg font-bold text-amber-600 dark:text-amber-400">
                                          {t('historicalCoursesSection', lang)}
                                      </h3>
                                      <span className="text-sm text-amber-500/70 font-mono">
                                          ({historicalCourses.length})
                                      </span>
                                  </div>
                                  <div className="flex-1 h-px bg-amber-200 dark:bg-amber-800/50" />
                                  <ChevronDown className={clsx(
                                      "w-5 h-5 text-amber-500 transition-transform duration-300",
                                      showHistorical && "rotate-180"
                                  )} />
                              </button>

                              <AnimatePresence>
                                  {showHistorical && (
                                      <motion.div
                                          initial={{ opacity: 0, height: 0 }}
                                          animate={{ opacity: 1, height: 'auto' }}
                                          exit={{ opacity: 0, height: 0 }}
                                          transition={{ duration: 0.3 }}
                                          className="overflow-hidden"
                                      >
                                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                              <AnimatePresence mode="popLayout">
                                                  {historicalCourses.map(course => (
                                                      <CourseCard
                                                          key={course.id}
                                                          course={course}
                                                          localCount={localStats.courses[course.name] || localStats.courses[course.alias]}
                                                          onUpdate={handleUpdateCourse}
                                                          onOpenFolder={handleOpenFolder}
                                                          onOpenReplayCenter={handleOpenReplayCenter}
                                                          lang={lang}
                                                      />
                                                  ))}
                                              </AnimatePresence>
                                          </div>
                                      </motion.div>
                                  )}
                              </AnimatePresence>
                          </div>
                      )}

                      {/* Bottom padding when no historical */}
                      {!hasHistorical && <div className="pb-20" />}
                    </>
                  );
              })()}
            </motion.div>
          )}

          {view === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto mt-10"
            >
              <div className="bg-white/80 dark:bg-cyber-gray/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 shadow-2xl backdrop-blur-sm transition-colors duration-300">
                <div className="flex justify-between items-center mb-8 border-b border-slate-200 dark:border-slate-700 pb-4">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <Settings className="w-6 h-6 text-neon-blue" />
                        {t('settingsTitle', lang)}
                    </h2>
                    <button 
                        onClick={() => setView('dashboard')}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <form onSubmit={handleSaveSettings} className="space-y-8">
                  {/* Account Section */}
                  <div className="space-y-4">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <LogIn className="w-4 h-4 text-neon-purple" />
                          {t('credentials', lang)}
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">{t('username', lang)}</label>
                            <input
                            type="text"
                            value={config.username}
                            onChange={e => handleConfigChange({...config, username: e.target.value})}
                            onFocus={(e) => e.target.placeholder = ''}
                            onBlur={(e) => e.target.placeholder = t('username', lang)}
                            className="w-full bg-slate-50 dark:bg-cyber-black border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 focus:border-neon-blue outline-none text-slate-900 dark:text-white transition-colors placeholder-slate-300 dark:placeholder-slate-600"
                            placeholder={t('username', lang)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">{t('password', lang)}</label>
                            <input
                            type="password"
                            value={config.password}
                            onChange={e => handleConfigChange({...config, password: e.target.value})}
                            onFocus={(e) => e.target.placeholder = ''}
                            onBlur={(e) => e.target.placeholder = '••••••••'}
                            className="w-full bg-slate-50 dark:bg-cyber-black border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 focus:border-neon-blue outline-none text-slate-900 dark:text-white transition-colors placeholder-slate-300 dark:placeholder-slate-600"
                            placeholder="••••••••"
                            />
                        </div>
                      </div>
                  </div>

                  {/* General Section */}
                  <div className="space-y-4">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <Folder className="w-4 h-4 text-neon-blue" />
                          {lang === 'zh' ? '存储设置' : 'Storage'}
                      </h3>
                      <div>
                        <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">{t('downloadDir', lang)}</label>
                        <div className="flex gap-2">
                            <input
                            type="text"
                            readOnly
                            value={config.download_dir}
                            className="flex-1 bg-slate-50 dark:bg-cyber-black/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-500 dark:text-slate-400 transition-colors"
                            />
                            <button
                            type="button"
                            onClick={selectFolder}
                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                            <Folder className="w-5 h-5 text-neon-purple" />
                            </button>
                        </div>
                      </div>
                  </div>

                  {/* Browser Section */}
                  <div className="space-y-4">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <Settings className="w-4 h-4 text-neon-purple" />
                          {t('browserSettings', lang)}
                      </h3>
                      <div>
                        <label className="block text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">{t('browser', lang)}</label>
                        <select
                            value={config.browser}
                            onChange={e => handleConfigChange({...config, browser: e.target.value})}
                            className="w-full bg-slate-50 dark:bg-cyber-black border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 focus:border-neon-blue outline-none text-slate-900 dark:text-white transition-colors cursor-pointer"
                        >
                            <option value="chrome">{t('browserChrome', lang)}</option>
                            <option value="firefox">{t('browserFirefox', lang)}</option>
                            <option value="edge">{t('browserEdge', lang)}</option>
                            <option value="safari">{t('browserSafari', lang)}</option>
                        </select>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                            {config.browser === 'safari'
                                ? t('safariWarning', lang)
                                : config.browser === 'edge'
                                ? t('edgeInfo', lang)
                                : config.browser === 'firefox'
                                ? t('firefoxInfo', lang)
                                : t('chromeInfo', lang)
                            }
                        </p>
                      </div>
                  </div>

                  {/* Behavior Section */}
                  <div className="space-y-4">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <Play className="w-4 h-4 text-green-400" />
                          {lang === 'zh' ? '行为设置' : 'Behavior'}
                      </h3>
                      <div className="space-y-3">
                          <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-neon-blue dark:hover:border-neon-blue transition-colors cursor-pointer group">
                              <div className="flex items-center gap-3">
                                  <div className={clsx("w-4 h-4 rounded border flex items-center justify-center transition-colors", config.headless ? "bg-neon-blue border-neon-blue" : "border-slate-400 dark:border-slate-600")}>
                                      {config.headless && <Check className="w-3 h-3 text-white" />}
                                  </div>
                                  <div>
                                      <div className="text-sm font-medium text-slate-900 dark:text-white">{t('headlessMode', lang)}</div>
                                      <div className="text-xs text-slate-500 dark:text-slate-400">{t('headlessModeDesc', lang)}</div>
                                  </div>
                              </div>
                              <input
                                  type="checkbox"
                                  className="hidden"
                                  checked={config.headless}
                                  onChange={e => handleConfigChange({...config, headless: e.target.checked})}
                              />
                          </label>

                          <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-neon-blue dark:hover:border-neon-blue transition-colors cursor-pointer group">
                              <div className="flex items-center gap-3">
                                  <div className={clsx("w-4 h-4 rounded border flex items-center justify-center transition-colors", config.auto_sync ? "bg-neon-blue border-neon-blue" : "border-slate-400 dark:border-slate-600")}>
                                      {config.auto_sync && <Check className="w-3 h-3 text-white" />}
                                  </div>
                                  <div>
                                      <div className="text-sm font-medium text-slate-900 dark:text-white">{t('autoSync', lang)}</div>
                                      <div className="text-xs text-slate-500 dark:text-slate-400">{t('autoSyncDesc', lang)}</div>
                                  </div>
                              </div>
                              <input
                                  type="checkbox"
                                  className="hidden"
                                  checked={config.auto_sync}
                                  onChange={e => handleConfigChange({...config, auto_sync: e.target.checked})}
                              />
                          </label>

                          {/* Historical Courses Toggle */}
                          <label className="flex items-center justify-between p-3 rounded-lg border border-amber-200 dark:border-amber-800/50 hover:border-amber-400 dark:hover:border-amber-600 transition-colors cursor-pointer group">
                              <div className="flex items-center gap-3">
                                  <div className={clsx("w-4 h-4 rounded border flex items-center justify-center transition-colors", config.show_history_toggle ? "bg-amber-500 border-amber-500" : "border-slate-400 dark:border-slate-600")}>
                                      {config.show_history_toggle && <Check className="w-3 h-3 text-white" />}
                                  </div>
                                  <div>
                                      <div className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
                                          <Archive className="w-3.5 h-3.5 text-amber-500" />
                                          {t('showHistoryToggle', lang)}
                                      </div>
                                      <div className="text-xs text-slate-500 dark:text-slate-400">{t('showHistoryToggleDesc', lang)}</div>
                                  </div>
                              </div>
                              <input
                                  type="checkbox"
                                  className="hidden"
                                  checked={config.show_history_toggle || false}
                                  onChange={e => handleConfigChange({...config, show_history_toggle: e.target.checked, ...(!e.target.checked && { include_history: false })})}
                              />
                          </label>

                          {/* Include Historical Courses (nested, only visible when show_history_toggle is on) */}
                          {config.show_history_toggle && (
                              <label className="flex items-center justify-between p-3 ml-6 rounded-lg border border-amber-200/60 dark:border-amber-800/30 hover:border-amber-400 dark:hover:border-amber-600 transition-colors cursor-pointer group bg-amber-50/50 dark:bg-amber-900/10">
                                  <div className="flex items-center gap-3">
                                      <div className={clsx("w-4 h-4 rounded border flex items-center justify-center transition-colors", config.include_history ? "bg-amber-500 border-amber-500" : "border-slate-400 dark:border-slate-600")}>
                                          {config.include_history && <Check className="w-3 h-3 text-white" />}
                                      </div>
                                      <div>
                                          <div className="text-sm font-medium text-slate-900 dark:text-white">{t('includeHistory', lang)}</div>
                                          <div className="text-xs text-slate-500 dark:text-slate-400">{t('includeHistoryDesc', lang)}</div>
                                      </div>
                                  </div>
                                  <input
                                      type="checkbox"
                                      className="hidden"
                                      checked={config.include_history || false}
                                      onChange={e => handleConfigChange({...config, include_history: e.target.checked})}
                                  />
                              </label>
                          )}
                      </div>
                  </div>

                  {/* Language Section */}
                  <div className="space-y-4">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                          <svg className="w-4 h-4 text-neon-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                          </svg>
                          {t('language', lang)}
                      </h3>
                      <div>
                        <select
                            value={config.language}
                            onChange={e => handleConfigChange({...config, language: e.target.value})}
                            className="w-full bg-slate-50 dark:bg-cyber-black border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 focus:border-neon-blue outline-none text-slate-900 dark:text-white transition-colors cursor-pointer"
                        >
                            <option value="en">English</option>
                            <option value="zh">简体中文</option>
                        </select>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                            {config.language === 'zh'
                                ? '🌏 应用界面语言'
                                : '🌎 Application interface language'
                            }
                        </p>
                      </div>
                  </div>

                  <div className="pt-6">
                      <p className="text-xs text-slate-400 dark:text-slate-500 text-center mb-4">
                          {lang === 'zh' ? '  更改会自动保存' : '  Changes are saved automatically'}
                      </p>
                      <div className="space-y-3">
                          <button
                            type="button"
                            onClick={() => setView('dashboard')}
                            className="w-full bg-neon-blue hover:bg-blue-600 text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-blue-500/20"
                          >
                            {lang === 'zh' ? '完成' : 'DONE'}
                          </button>

                          <button
                            type="button"
                            onClick={handleLogout}
                            className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
                          >
                            <LogOut className="w-5 h-5" />
                            {lang === 'zh' ? '退出登录' : 'LOGOUT'}
                          </button>
                      </div>
                  </div>

                  {/* Brand Footer */}
                  <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
                      <BrandFooter theme={theme} showGithub={true} showAuthor={true} />
                  </div>
                </form>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Terminal / Logs */}
      <AnimatePresence>
        {isLogOpen && (
            <motion.div 
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                style={{ height: logHeight }}
                className="fixed bottom-0 left-0 w-full bg-white/90 dark:bg-black/90 border-t border-slate-200 dark:border-slate-800 backdrop-blur-md font-mono text-xs z-40 transition-colors duration-300 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]"
            >
                {/* Resize Handle */}
                <div 
                    onMouseDown={startResizing}
                    className="absolute top-0 left-0 w-full h-1.5 cursor-row-resize hover:bg-neon-blue/50 transition-colors z-50"
                />
                
                {/* Header */}
                <div 
                    className="absolute top-0 left-0 w-full h-8 bg-slate-50/50 dark:bg-slate-900/50 flex items-center px-4 border-b border-slate-200 dark:border-slate-800 select-none cursor-row-resize"
                    onMouseDown={startResizing}
                >
                    <Terminal className="w-3 h-3 text-slate-400 mr-2" />
                    <span className="text-slate-500 dark:text-slate-400 font-bold tracking-wider">
                        {lang === 'zh' ? '系统日志' : 'SYSTEM LOGS'}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 hidden sm:inline">
                            {lang === 'zh' ? '拖动调整大小' : 'Drag to resize'}
                        </span>
                        <button 
                            onClick={() => setIsLogOpen(false)} 
                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                            title={t('close', lang)}
                        >
                            <X className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                        </button>
                    </div>
                </div>

                <div className="mt-8 h-[calc(100%-2rem)] overflow-y-auto p-4 space-y-1 custom-scrollbar">
                    {logs.map((log, i) => (
                        <div key={i} className="text-slate-600 dark:text-slate-300 border-l-2 border-transparent hover:border-neon-blue pl-2 transition-colors break-all">
                            <span className="text-slate-400 dark:text-slate-500 mr-2">[{new Date().toLocaleTimeString()}]</span>
                            {log}
                        </div>
                    ))}
                    <div ref={logsEndRef} />
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      <AnimatePresence>
        {!isLogOpen && (
            <motion.button
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
                onClick={() => { setIsLogOpen(true); setLogHeight(200); }}
                className="fixed bottom-4 right-6 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-full shadow-lg hover:shadow-xl hover:border-neon-blue dark:hover:border-neon-blue transition-all flex items-center gap-2 text-xs font-bold z-30"
            >
                <Terminal className="w-3 h-3" />
                {t('expandLog', lang)}
                <ChevronUp className="w-3 h-3" />
            </motion.button>
        )}
      </AnimatePresence>

      {/* Sync Report Modal */}
      <AnimatePresence>
        {showSyncReport && currentReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowSyncReport(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden border border-slate-200 dark:border-slate-700"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-neon-blue to-neon-purple p-6 text-white">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-2xl font-bold">{t('syncComplete', lang)}</h3>
                    <p className="text-sm opacity-90 mt-1">{currentReport.started_at} - {currentReport.finished_at}</p>
                    <p className="text-xs opacity-75 mt-1">{t('duration', lang)}: {currentReport.duration_seconds}s</p>
                  </div>
                  <button
                    onClick={() => setShowSyncReport(false)}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Summary */}
                <div className="grid grid-cols-3 gap-4 mt-6">
                  <div className="bg-white/20 rounded-lg p-3">
                    <div className="text-3xl font-bold">{currentReport.summary.downloaded}</div>
                    <div className="text-xs opacity-90">{t('downloaded', lang)}</div>
                  </div>
                  <div className="bg-white/20 rounded-lg p-3">
                    <div className="text-3xl font-bold">{currentReport.summary.skipped}</div>
                    <div className="text-xs opacity-90">{t('skipped', lang)}</div>
                  </div>
                  <div className="bg-white/20 rounded-lg p-3">
                    <div className="text-3xl font-bold">{currentReport.summary.failed}</div>
                    <div className="text-xs opacity-90">{t('failed', lang)}</div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[50vh] custom-scrollbar">
                {/* Downloaded Files */}
                {currentReport.files.downloaded.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-bold text-green-600 dark:text-green-400 mb-3 flex items-center gap-2">
                      <Check className="w-4 h-4" />
                      {t('downloaded', lang)} ({currentReport.files.downloaded.length})
                    </h4>
                    <div className="space-y-2">
                      {currentReport.files.downloaded.map((file, idx) => (
                        <div key={idx} className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 group">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleOpenFile(file.course_id, file.name, file.course)}
                              className="flex-1 font-mono text-sm text-slate-900 dark:text-white hover:text-neon-blue dark:hover:text-neon-blue transition-colors cursor-pointer text-left flex items-center gap-2 group/btn"
                              title={t('openFile', lang) || "Click to open file"}
                            >
                              <ExternalLink className="w-3 h-3 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                              <span className="truncate">{file.name}</span>
                            </button>
                            <button
                              onClick={() => handleOpenFolder(file.course_id || file.course)}
                              className="p-1.5 hover:bg-green-200 dark:hover:bg-green-800 rounded transition-colors opacity-0 group-hover:opacity-100"
                              title={t('openFolder', lang)}
                            >
                              <FolderOpen className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                            </button>
                          </div>
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-xs text-slate-600 dark:text-slate-400">{file.course}</span>
                            <span className="text-xs text-slate-500">
                              {file.size ? `${(file.size / 1024).toFixed(1)} KB` : ''}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Failed Files */}
                {currentReport.files.failed.length > 0 && (
                  <div className="mb-6">
                    <h4 className="font-bold text-red-600 dark:text-red-400 mb-3 flex items-center gap-2">
                      <X className="w-4 h-4" />
                      {t('failed', lang)} ({currentReport.files.failed.length})
                    </h4>
                    <div className="space-y-2">
                      {currentReport.files.failed.map((file, idx) => (
                        <div key={idx} className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                          <div className="font-mono text-sm text-slate-900 dark:text-white">{file.name}</div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">{file.course}</div>
                          <div className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-start gap-1">
                            <span className="font-semibold">{file.error_type}:</span>
                            <span className="flex-1">{file.error}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skipped Files */}
                {currentReport.files.skipped.length > 0 && (
                  <div>
                    <h4 className="font-bold text-slate-600 dark:text-slate-400 mb-3 flex items-center gap-2">
                      <RefreshCw className="w-4 h-4" />
                      {t('skipped', lang)} ({currentReport.files.skipped.length})
                    </h4>
                    <div className="space-y-2">
                      {currentReport.files.skipped.map((file, idx) => (
                        <div key={idx} className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                          <div className="font-mono text-sm text-slate-700 dark:text-slate-300">{file.name}</div>
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-xs text-slate-600 dark:text-slate-400">{file.course}</span>
                            <span className="text-xs text-slate-500">{file.reason}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {showHistoryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowHistoryModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden border border-slate-200 dark:border-slate-700"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-slate-700 to-slate-900 p-6 text-white">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Clock className="w-6 h-6" />
                    <h3 className="text-2xl font-bold">{t('syncHistory', lang)}</h3>
                  </div>
                  <button
                    onClick={() => setShowHistoryModal(false)}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[60vh] custom-scrollbar">
                {syncReports.length === 0 ? (
                  <div className="text-center text-slate-500 dark:text-slate-400 py-12">
                    <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>{t('noSyncHistory', lang)}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {syncReports.map((report, idx) => (
                      <motion.div
                        key={report.sync_id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        onClick={() => {
                          getApi().get_sync_report(report.sync_id).then(fullReport => {
                            setCurrentReport(fullReport);
                            setShowHistoryModal(false);
                            setShowSyncReport(true);
                          });
                        }}
                        className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-neon-blue dark:hover:border-neon-blue transition-all cursor-pointer"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                              {report.sync_id}
                            </div>
                            <div className="text-sm text-slate-700 dark:text-slate-300 mt-1">
                              {report.started_at}
                            </div>
                          </div>
                          <div className={clsx(
                            "px-3 py-1 rounded-full text-xs font-bold",
                            report.status === 'success'
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                              : report.status === 'stopped'
                              ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                              : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                          )}>
                            {report.status === 'stopped' ? t('stopped', lang) : report.status}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-2 border border-slate-200 dark:border-slate-700">
                            <div className="text-lg font-bold text-green-600 dark:text-green-400">
                              {report.summary.downloaded}
                            </div>
                            <div className="text-xs text-slate-500">{t('downloaded', lang)}</div>
                          </div>
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-2 border border-slate-200 dark:border-slate-700">
                            <div className="text-lg font-bold text-slate-600 dark:text-slate-400">
                              {report.summary.skipped}
                            </div>
                            <div className="text-xs text-slate-500">{t('skipped', lang)}</div>
                          </div>
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-2 border border-slate-200 dark:border-slate-700">
                            <div className="text-lg font-bold text-red-600 dark:text-red-400">
                              {report.summary.failed}
                            </div>
                            <div className="text-xs text-slate-500">{t('failed', lang)}</div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Progress Bar */}
      <AnimatePresence>
        {progressData && (progressData.phase === 'downloading' || progressData.phase === 'paused' || progressData.phase === 'scanning') && isProgressExpanded && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-0 left-0 right-0 z-50"
          >
            {/* Main container with rounded top corners and subtle glow */}
            <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-x border-slate-200 dark:border-slate-700 shadow-2xl rounded-t-3xl relative">
              {/* Subtle top glow effect */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-1/2 h-4 bg-gradient-to-b from-blue-500/10 to-transparent blur-md" />
              {/* Decorative handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
              </div>

              {/* Top gradient progress line */}
              <div className="px-6">
                <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg relative overflow-hidden transition-all duration-100 ease-out"
                    style={{
                      width: `${((progressData.current_course_index - 1 + (progressData.course_files_done / Math.max(progressData.course_files_total, 1))) / Math.max(progressData.total_courses, 1)) * 100}%`
                    }}
                  >
                    {/* 降低高亮透明度 via-white/10 */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
                  </div>
                </div>
              </div>

              {/* Progress content */}
              <div className="px-6 py-4">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex-1">
                    <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <div className={clsx(
                        "w-8 h-8 rounded-full flex items-center justify-center shadow-lg",
                        isPaused
                          ? "bg-gradient-to-br from-amber-400 to-amber-600"
                          : "bg-gradient-to-br from-neon-blue to-neon-purple"
                      )}>
                        {isPaused
                          ? <Pause className="w-4 h-4 text-white" />
                          : progressData.phase === 'scanning'
                            ? <Search className="w-4 h-4 text-white animate-pulse" />
                            : <Download className="w-4 h-4 text-white animate-bounce" />
                        }
                      </div>
                      {isPaused ? t('paused', lang) + ':' : progressData.phase === 'scanning' ? t('scanningCourse', lang) : t('syncingCourse', lang)} {progressData.current_course_name}
                      <span className="text-xs font-normal text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                        {t('course', lang)} {progressData.current_course_index}/{progressData.total_courses}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 ml-10 flex items-center gap-2">
                      <span className="truncate max-w-md">{progressData.phase === 'scanning' ? t('scanningFiles', lang) : <>{t('currentFile', lang)} {progressData.current_file_name}</>}</span>
                      {progressData.phase !== 'scanning' && (progressData.bytes_expected > 0 || progressData.bytes_downloaded > 0) && (
                        <span className="text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          {progressData.bytes_expected > 0 && progressData.bytes_downloaded <= progressData.bytes_expected
                            ? `${(progressData.bytes_downloaded / 1024 / 1024).toFixed(1)} / ${(progressData.bytes_expected / 1024 / 1024).toFixed(1)} MB`
                            : `${(progressData.bytes_downloaded / 1024 / 1024).toFixed(1)} MB`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Paused badge */}
                    {isPaused && (
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 rounded-xl border border-amber-200 dark:border-amber-800 animate-pulse">
                        {t('paused', lang)}
                      </span>
                    )}

                    {/* Pause/Resume button */}
                    <button
                      onClick={handlePauseSync}
                      className={clsx(
                        "px-3 py-2 text-xs rounded-xl transition-all flex items-center gap-2 border shadow-sm hover:shadow-md font-medium",
                        isPaused
                          ? "bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800"
                          : "bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                      )}
                    >
                      {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                      {isPaused ? t('resume', lang) : t('pause', lang)}
                    </button>

                    {/* Stop button */}
                    <button
                      onClick={handleStopSync}
                      className="px-3 py-2 text-xs bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-xl transition-all flex items-center gap-2 border border-red-200 dark:border-red-800 shadow-sm hover:shadow-md font-medium"
                    >
                      <Square className="w-3.5 h-3.5" />
                      {t('stop', lang)}
                    </button>

                    <div className="w-px h-6 bg-slate-300 dark:bg-slate-600" />

                    <div className="flex items-center gap-3 text-xs bg-slate-50 dark:bg-slate-800/50 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
                      <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-bold">
                        <Check className="w-3 h-3" />
                        {progressData.stats.downloaded}
                      </span>
                      <div className="w-px h-4 bg-slate-300 dark:bg-slate-600" />
                      <span className="flex items-center gap-1 text-slate-500 font-bold">
                        <RefreshCw className="w-3 h-3" />
                        {progressData.stats.skipped}
                      </span>
                      <div className="w-px h-4 bg-slate-300 dark:bg-slate-600" />
                      <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-bold">
                        <X className="w-3 h-3" />
                        {progressData.stats.failed}
                      </span>
                    </div>

                    <button
                      onClick={() => setIsLogOpen(!isLogOpen)}
                      className="px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all flex items-center gap-2 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md"
                    >
                      <Terminal className="w-3 h-3" />
                      {isLogOpen ? t('hideLog', lang) : t('expandLog', lang)}
                    </button>

                    <button
                      onClick={() => setIsProgressExpanded(false)}
                      className="px-3 py-2 text-xs bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 hover:from-slate-200 hover:to-slate-300 dark:hover:from-slate-700 dark:hover:to-slate-600 rounded-xl transition-all flex items-center gap-2 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md"
                      title={t('collapse', lang)}
                    >
                      <ChevronDown className="w-4 h-4" />
                      {t('collapse', lang)}
                    </button>
                  </div>
                </div>

                {/* Course progress bar */}
                <div className="mt-3 bg-slate-50 dark:bg-slate-800/30 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between text-xs mb-2 text-slate-600 dark:text-slate-400 font-medium">
                    <span>{t('courseProgress', lang)}</span>
                    <span className="font-mono">
                      {progressData.phase === 'scanning'
                        ? t('scanningFiles', lang)
                        : <>
                            {progressData.course_files_total > 0
                              ? `${Math.round((progressData.course_files_done / progressData.course_files_total) * 100)}%`
                              : '0%'
                            } ({progressData.course_files_done}/{progressData.course_files_total})
                          </>
                      }
                    </span>
                  </div>
                  <div className="h-3 bg-slate-200 dark:bg-slate-900 rounded-full overflow-hidden shadow-inner">
                    {progressData.phase === 'scanning' ? (
                      <div
                        className="h-full w-1/3 bg-gradient-to-r from-neon-blue to-blue-500 shadow-lg relative overflow-hidden animate-indeterminate"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent animate-shimmer" />
                      </div>
                    ) : (
                      <div
                        className="h-full bg-gradient-to-r from-neon-blue to-blue-500 shadow-lg relative overflow-hidden transition-all duration-100 ease-out"
                        style={{
                          width: `${progressData.course_files_total > 0 ? (progressData.course_files_done / progressData.course_files_total) * 100 : 0}%`
                        }}
                      >
                        {/* 降低高亮透明度 via-white/15 */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent animate-shimmer" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mini Progress Indicator (Bottom Right) */}
      <AnimatePresence>
        {progressData && (progressData.phase === 'downloading' || progressData.phase === 'paused' || progressData.phase === 'scanning') && !isProgressExpanded && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsProgressExpanded(true)}
            className="fixed bottom-6 right-6 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 cursor-pointer hover:shadow-neon-blue/20 hover:border-neon-blue/50 transition-all z-40 w-64"
          >
            {/* Mini progress ring */}
            <div className="flex items-center gap-3 mb-3">
              <div className="relative w-12 h-12">
                <svg className="w-12 h-12 transform -rotate-90">
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    className="text-slate-200 dark:text-slate-800"
                  />
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    stroke="url(#gradient)"
                    strokeWidth="4"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 20}`}
                    strokeDashoffset={`${2 * Math.PI * 20 * (1 - (progressData.current_course_index - 1 + (progressData.course_files_done / Math.max(progressData.course_files_total, 1))) / Math.max(progressData.total_courses, 1))}`}
                    className="transition-all duration-100"
                    strokeLinecap="round"
                  />
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  {isPaused
                    ? <Pause className="w-5 h-5 text-amber-500" />
                    : progressData.phase === 'scanning'
                      ? <Search className="w-5 h-5 text-neon-blue animate-pulse" />
                      : <Download className="w-5 h-5 text-neon-blue animate-pulse" />
                  }
                </div>
              </div>

              <div className="flex-1">
                <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {progressData.current_course_name}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {t('course', lang)} {progressData.current_course_index}/{progressData.total_courses}
                </div>
              </div>
            </div>

            {/* Course progress */}
            <div className="mb-2">
              <div className="flex justify-between text-xs mb-1 text-slate-600 dark:text-slate-400">
                <span>{t('courseProgress', lang)}</span>
                <span>
                  {progressData.phase === 'scanning'
                    ? t('scanningFiles', lang)
                    : progressData.course_files_total > 0
                      ? `${Math.round((progressData.course_files_done / progressData.course_files_total) * 100)}%`
                      : '0%'
                  }
                </span>
              </div>
              <div className="h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                {progressData.phase === 'scanning' ? (
                  <div
                    className="h-full w-1/3 bg-gradient-to-r from-neon-blue to-neon-purple animate-indeterminate"
                  />
                ) : (
                  <div
                    className="h-full bg-gradient-to-r from-neon-blue to-neon-purple transition-all duration-100 ease-out"
                    style={{
                      width: `${progressData.course_files_total > 0 ? (progressData.course_files_done / progressData.course_files_total) * 100 : 0}%`
                    }}
                  />
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 border-t border-slate-200 dark:border-slate-700 pt-2 mb-2">
              <button
                onClick={(e) => { e.stopPropagation(); handlePauseSync(); }}
                className={clsx(
                  "flex-1 py-1.5 text-xs rounded-lg transition-all flex items-center justify-center gap-1 font-medium border",
                  isPaused
                    ? "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800"
                    : "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                )}
              >
                {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                {isPaused ? t('resume', lang) : t('pause', lang)}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleStopSync(); }}
                className="flex-1 py-1.5 text-xs bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg transition-all flex items-center justify-center gap-1 font-medium border border-red-200 dark:border-red-800"
              >
                <Square className="w-3 h-3" />
                {t('stop', lang)}
              </button>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <Check className="w-3 h-3" />
                {progressData.stats.downloaded}
              </span>
              <span className="flex items-center gap-1 text-slate-500">
                <RefreshCw className="w-3 h-3" />
                {progressData.stats.skipped}
              </span>
              <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                <X className="w-3 h-3" />
                {progressData.stats.failed}
              </span>
              {isPaused && (
                <span className="ml-auto text-xs font-bold text-amber-500 animate-pulse">{t('paused', lang)}</span>
              )}
              {!isPaused && (
                <span className="ml-auto text-xs text-slate-400">{t('clickToExpand', lang)}</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default App;
