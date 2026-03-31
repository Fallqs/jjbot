import { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Settings,
  List,
  Sun,
  Type,
  Bookmark,
  Menu,
  Loader2,
  Cookie,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { fetchChapter, getJjwxcCookie, setJjwxcCookie, clearJjwxcCookie, type Novel } from '@/data/jjwxcApi';
import { autoConvertCookieInput } from '@/data/cookieParser';

interface ReaderProps {
  novel: Novel;
  novelId: string;
  initialChapter?: number;
  onExit: () => void;
}

type Theme = 'light' | 'dark' | 'sepia' | 'green';

interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
  theme: Theme;
}

const themes = {
  light: {
    bg: 'bg-white',
    text: 'text-gray-800',
    nav: 'bg-white/90 border-gray-200',
    panel: 'bg-white border-gray-200',
  },
  dark: {
    bg: 'bg-gray-900',
    text: 'text-gray-200',
    nav: 'bg-gray-900/90 border-gray-700',
    panel: 'bg-gray-800 border-gray-700',
  },
  sepia: {
    bg: 'bg-[#f5e6d3]',
    text: 'text-[#5c4a3a]',
    nav: 'bg-[#f5e6d3]/90 border-[#d4c4b0]',
    panel: 'bg-[#faf0e6] border-[#d4c4b0]',
  },
  green: {
    bg: 'bg-[#e8f5e9]',
    text: 'text-[#2e4a30]',
    nav: 'bg-[#e8f5e9]/90 border-[#c8e6c9]',
    panel: 'bg-[#f1f8e9] border-[#c8e6c9]',
  },
};

export default function Reader({ novel, novelId, initialChapter = 1, onExit }: ReaderProps) {
  const [currentChapter, setCurrentChapter] = useState(initialChapter);
  const [chapterContent, setChapterContent] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [cookieValue, setCookieValue] = useState(getJjwxcCookie());
  const [cookieDialogOpen, setCookieDialogOpen] = useState(false);
  const [cookieParseInfo, setCookieParseInfo] = useState<{ format: string; total: number; jjwxcCount: number } | null>(null);
  const [settings, setSettings] = useState<ReaderSettings>({
    fontSize: 18,
    lineHeight: 1.8,
    theme: 'light',
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showNav, setShowNav] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentTheme = themes[settings.theme];

  const currentChapterInfo = novel.chapters.find((c) => c.id === currentChapter);

  // Load chapter content when chapter changes
  useEffect(() => {
    const loadChapter = async () => {
      setLoading(true);
      setError(null);
      try {
        const chapter = await fetchChapter(novelId, currentChapter, currentChapterInfo?.isVip);
        setChapterContent(chapter.content);
        setChapterTitle(chapter.title);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
        setChapterContent('');
        setChapterTitle('');
      } finally {
        setLoading(false);
      }
    };

    loadChapter();
  }, [currentChapter, novelId, retryTick, currentChapterInfo?.isVip]);

  // Handle scroll to auto-hide navigation
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setShowNav(false);
      } else {
        setShowNav(true);
      }

      scrollTimeoutRef.current = setTimeout(() => {
        setShowNav(true);
      }, 2000);

      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [lastScrollY]);

  // Scroll to top when chapter changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentChapter]);

  const handlePrevChapter = () => {
    if (currentChapter > 1) {
      setCurrentChapter(currentChapter - 1);
    }
  };

  const handleNextChapter = () => {
    if (currentChapter < novel.chapters.length) {
      setCurrentChapter(currentChapter + 1);
    }
  };

  const handleChapterSelect = (chapterId: number) => {
    setCurrentChapter(chapterId);
  };

  const formatContent = (content: string) => {
    return content.split('\n\n').map((paragraph, index) => {
      const trimmed = paragraph.trim();
      if (!trimmed) return null;

      // Check if it's dialogue
      if (trimmed.startsWith('"') || trimmed.startsWith('「') || trimmed.startsWith('『')) {
        return (
          <p
            key={index}
            className="mb-4 indent-0 pl-4"
            style={{
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
            }}
          >
            {trimmed}
          </p>
        );
      }

      // Check if it's a system message
      if (trimmed.startsWith('【') && trimmed.endsWith('】')) {
        return (
          <p
            key={index}
            className="mb-4 text-center font-medium opacity-80"
            style={{
              fontSize: `${settings.fontSize * 0.9}px`,
              lineHeight: settings.lineHeight,
            }}
          >
            {trimmed}
          </p>
        );
      }

      return (
        <p
          key={index}
          className="mb-4 indent-8"
          style={{
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
          }}
        >
          {trimmed}
        </p>
      );
    }).filter(Boolean);
  };

  const displayTitle = chapterTitle || novel.chapters.find((c) => c.id === currentChapter)?.title || `第${currentChapter}章`;

  return (
    <div className={`min-h-screen transition-colors duration-300 ${currentTheme.bg} ${currentTheme.text}`}>
      {/* Top Navigation */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b backdrop-blur-sm ${
          showNav ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
        } ${currentTheme.nav}`}
      >
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onExit}
              className="hover:bg-black/5"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="hidden sm:block">
              <h1 className="font-medium text-sm truncate max-w-[200px]">{novel.title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* TOC Sheet */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="hover:bg-black/5">
                  <List className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className={`w-80 ${currentTheme.panel}`}
              >
                <SheetHeader>
                  <SheetTitle className={currentTheme.text}>目录</SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-1">
                  {novel.chapters.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => handleChapterSelect(ch.id)}
                      className={`w-full text-left px-4 py-3 rounded-lg transition-all text-sm ${
                        currentChapter === ch.id
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'hover:bg-black/5'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate">{ch.title}</span>
                        {currentChapter === ch.id && (
                          <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                            阅读中
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </SheetContent>
            </Sheet>

            {/* Settings Dropdown */}
            <DropdownMenu open={showSettings} onOpenChange={setShowSettings}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="hover:bg-black/5">
                  <Settings className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className={`w-72 p-4 ${currentTheme.panel}`}
              >
                {/* Font Size */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Type className="w-4 h-4" />
                    <span className="text-sm font-medium">字体大小</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSettings((s) => ({ ...s, fontSize: Math.max(12, s.fontSize - 2) }))}
                      className="h-8 w-8 p-0"
                    >
                      <span className="text-xs">A-</span>
                    </Button>
                    <Slider
                      value={[settings.fontSize]}
                      onValueChange={([v]) => setSettings((s) => ({ ...s, fontSize: v }))}
                      min={12}
                      max={32}
                      step={1}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSettings((s) => ({ ...s, fontSize: Math.min(32, s.fontSize + 2) }))}
                      className="h-8 w-8 p-0"
                    >
                      <span className="text-sm">A+</span>
                    </Button>
                  </div>
                  <div className="text-center text-xs text-muted-foreground mt-1">
                    {settings.fontSize}px
                  </div>
                </div>

                {/* Line Height */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium">行间距</span>
                  </div>
                  <div className="flex gap-2">
                    {[1.5, 1.8, 2.0, 2.5].map((h) => (
                      <Button
                        key={h}
                        variant={settings.lineHeight === h ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSettings((s) => ({ ...s, lineHeight: h }))}
                        className="flex-1"
                      >
                        {h}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Theme */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Sun className="w-4 h-4" />
                    <span className="text-sm font-medium">阅读主题</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { key: 'light', label: '白天', bg: 'bg-white', border: 'border-gray-300' },
                      { key: 'dark', label: '夜间', bg: 'bg-gray-800', border: 'border-gray-600' },
                      { key: 'sepia', label: '护眼', bg: 'bg-[#f5e6d3]', border: 'border-[#d4c4b0]' },
                      { key: 'green', label: '清新', bg: 'bg-[#e8f5e9]', border: 'border-[#c8e6c9]' },
                    ].map((t) => (
                      <button
                        key={t.key}
                        onClick={() => setSettings((s) => ({ ...s, theme: t.key as Theme }))}
                        className={`p-2 rounded-lg border-2 transition-all ${
                          settings.theme === t.key
                            ? 'border-primary ring-2 ring-primary/20'
                            : 'border-transparent'
                        }`}
                      >
                        <div className={`w-full h-8 rounded ${t.bg} border ${t.border} mb-1`} />
                        <span className="text-xs">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={cookieDialogOpen} onOpenChange={setCookieDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`hover:bg-black/5 ${getJjwxcCookie() ? 'text-primary' : ''}`}
                  title="Cookie 设置"
                >
                  <Cookie className="w-5 h-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>晋江 Cookie 设置</DialogTitle>
                  <DialogDescription>
                    粘贴从浏览器开发者工具中复制的 jjwxc.net Cookie，以解锁已购买的 VIP 章节。
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>获取方式：</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>在浏览器中登录 <a href="https://www.jjwxc.net" target="_blank" rel="noreferrer" className="text-primary underline">jjwxc.net</a></li>
                      <li>购买需要阅读的 VIP 章节</li>
                      <li>按 F12 → Application → Cookies → <code>jjwxc.net</code></li>
                      <li>复制 Cookie 字符串并粘贴到下方</li>
                    </ol>
                  </div>
                  <Textarea
                    placeholder="可直接粘贴 Edge 导出的 Cookie 表格、Netscape 格式、JSON 或普通 Cookie 字符串"
                    value={cookieValue}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCookieValue(value);
                      const result = autoConvertCookieInput(value);
                      if (result.format !== 'empty' && result.format !== 'unknown' && result.format !== 'string') {
                        setCookieParseInfo({ format: result.format, total: result.total, jjwxcCount: result.jjwxcCount });
                        if (result.jjwxcCount > 0) {
                          setCookieValue(result.cookieString);
                        }
                      } else if (result.format === 'string') {
                        setCookieParseInfo({ format: result.format, total: result.total, jjwxcCount: result.jjwxcCount });
                      } else {
                        setCookieParseInfo(null);
                      }
                    }}
                    rows={4}
                  />
                  {cookieParseInfo && (
                    <p className="text-xs text-muted-foreground">
                      检测到 {cookieParseInfo.format} 格式，共 {cookieParseInfo.total} 条 Cookie
                      {cookieParseInfo.jjwxcCount > 0 && `，已提取 ${cookieParseInfo.jjwxcCount} 条晋江相关 Cookie`}
                      {cookieParseInfo.jjwxcCount === 0 && '（未找到晋江相关 Cookie）'}
                    </p>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={() => { clearJjwxcCookie(); setCookieValue(''); setCookieDialogOpen(false); }}>
                      清除
                    </Button>
                    <Button onClick={() => { setJjwxcCookie(cookieValue.trim()); setCookieDialogOpen(false); }}>
                      保存
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Button variant="ghost" size="icon" className="hover:bg-black/5">
              <Bookmark className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-20 pb-32 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Chapter Header */}
          <div className="mb-8 text-center">
            <h2
              className="text-2xl sm:text-3xl font-bold mb-2"
              style={{ fontSize: `${settings.fontSize + 6}px` }}
            >
              {displayTitle}
            </h2>
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <span>作者：{novel.author}</span>
              <span>·</span>
              <span>第 {currentChapter}/{novel.chapters.length} 章</span>
            </div>
          </div>

          {/* Loading / Error / Content */}
          <div
            ref={contentRef}
            className="prose prose-lg max-w-none min-h-[50vh]"
          >
            {loading && (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">正在加载章节内容...</p>
              </div>
            )}

            {!loading && error && (
              <div className="text-center py-20 px-4">
                <p className="text-destructive font-medium mb-2">加载失败</p>
                <p className="text-muted-foreground text-sm mb-4 max-w-md mx-auto">{error}</p>
                {(error.includes('VIP') || error.includes('登录') || error.includes('购买')) && (
                  <div className="space-y-2 mb-4">
                    <Button onClick={() => setCookieDialogOpen(true)} variant="outline" className="w-full max-w-xs">
                      打开 Cookie 设置
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      提示：在浏览器登录 jjwxc.net 并购买章节后，复制 Cookie 粘贴到设置中
                    </p>
                  </div>
                )}
                <Button onClick={() => setRetryTick((t) => t + 1)}>重试</Button>
              </div>
            )}

            {!loading && !error && (
              <>
                {formatContent(chapterContent)}

                {/* Chapter End */}
                <div className="mt-12 text-center">
                  <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
                    <span className="w-12 h-px bg-current opacity-30" />
                    <span>本章完</span>
                    <span className="w-12 h-px bg-current opacity-30" />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav
        className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 border-t backdrop-blur-sm ${
          showNav ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
        } ${currentTheme.nav}`}
      >
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handlePrevChapter}
            disabled={currentChapter <= 1}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">上一章</span>
          </Button>

          {/* Progress Bar */}
          <div className="flex-1 mx-4 sm:mx-8">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>进度</span>
              <span>{Math.round((currentChapter / novel.chapters.length) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${(currentChapter / novel.chapters.length) * 100}%` }}
              />
            </div>
          </div>

          <Button
            variant="outline"
            onClick={handleNextChapter}
            disabled={currentChapter >= novel.chapters.length}
            className="flex items-center gap-2"
          >
            <span className="hidden sm:inline">下一章</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </nav>

      {/* Quick Navigation Buttons (Floating) */}
      <div className={`fixed right-4 bottom-24 z-40 flex flex-col gap-2 transition-all duration-300 ${
        showNav ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              size="icon"
              className="shadow-lg"
            >
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className={`w-80 ${currentTheme.panel}`}
          >
            <SheetHeader>
              <SheetTitle className={currentTheme.text}>章节列表</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-1 max-h-[calc(100vh-8rem)] overflow-y-auto">
              {novel.chapters.map((ch, index) => (
                <button
                  key={ch.id}
                  onClick={() => handleChapterSelect(ch.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all text-sm ${
                    currentChapter === ch.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'hover:bg-black/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-8">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="truncate flex-1">{ch.title}</span>
                  </div>
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
