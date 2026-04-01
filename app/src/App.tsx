import { useState, useEffect } from 'react';
import { BookOpen, Search, Library, User, Star, TrendingUp, Clock, Heart, Share, Loader2, Cookie, Sparkles } from 'lucide-react';
import LibrarySection from '@/sections/Library';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import Reader from '@/sections/Reader';

import { fetchNovelInfo, getJjwxcCookie, setJjwxcCookie, clearJjwxcCookie, type Novel } from '@/data/jjwxcApi';
import { autoConvertCookieInput } from '@/data/cookieParser';
import './App.css';

function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlReadId = urlParams.get('read');
  const urlDetailId = urlParams.get('novel');
  const urlChapter = parseInt(urlParams.get('chapter') || '1', 10);

  const initialView = urlReadId ? 'reading' : 'library';
  const [currentView, setCurrentView] = useState<'home' | 'library' | 'reading'>(initialView);
  const [currentChapter, setCurrentChapter] = useState(isNaN(urlChapter) ? 1 : urlChapter);
  const [novelId, setNovelId] = useState(urlReadId || urlDetailId || '5484954');
  const [searchInput, setSearchInput] = useState(urlReadId || urlDetailId || '5484954');
  const [novel, setNovel] = useState<Novel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cookieValue, setCookieValue] = useState(getJjwxcCookie());
  const [cookieDialogOpen, setCookieDialogOpen] = useState(false);
  const [cookieParseInfo, setCookieParseInfo] = useState<{ format: string; total: number; jjwxcCount: number } | null>(null);
  const [kimiDialogOpen, setKimiDialogOpen] = useState(false);
  const [kimiApiKey, setKimiApiKey] = useState('');
  const [kimiConfigured, setKimiConfigured] = useState(false);

  useEffect(() => {
    loadNovel(novelId);
  }, [novelId]);

  useEffect(() => {
    if (urlDetailId) {
      setCurrentView('home');
    }
  }, []);

  useEffect(() => {
    fetch('/api/config/kimi')
      .then(r => r.json())
      .then(data => setKimiConfigured(data.configured))
      .catch(() => {});
  }, []);

  const loadNovel = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const [webRes, dbRes] = await Promise.allSettled([
        fetchNovelInfo(id),
        fetch(`/api/novels/${id}`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      if (webRes.status === 'fulfilled') {
        const merged = { ...webRes.value, ...(dbRes.status === 'fulfilled' && dbRes.value ? dbRes.value : {}) };
        setNovel(merged);
      } else {
        throw webRes.reason;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      setNovel(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const id = searchInput.trim();
    if (id && /^\d+$/.test(id)) {
      setNovelId(id);
      setCurrentView('home');
    } else {
      setError('请输入有效的小说ID（纯数字）');
    }
  };

  const handleSaveCookie = () => {
    setJjwxcCookie(cookieValue.trim());
    setCookieDialogOpen(false);
  };

  const handleCookieInputChange = (value: string) => {
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
  };

  const handleClearCookie = () => {
    clearJjwxcCookie();
    setCookieValue('');
    setCookieDialogOpen(false);
  };

  const handleSaveKimiKey = async () => {
    await fetch('/api/config/kimi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: kimiApiKey.trim() }),
    });
    setKimiConfigured(true);
    setKimiDialogOpen(false);
  };

  const handleClearKimiKey = async () => {
    await fetch('/api/config/kimi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: '' }),
    });
    setKimiApiKey('');
    setKimiConfigured(false);
    setKimiDialogOpen(false);
  };

  const startReading = (chapterId: number = 1) => {
    setCurrentChapter(chapterId);
    setCurrentView('reading');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (currentView === 'reading' && novel) {
    return (
      <Reader
        novel={novel}
        novelId={novelId}
        initialChapter={currentChapter}
        onExit={() => setCurrentView('home')}
      />
    );
  }

  const hasCookie = !!getJjwxcCookie();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">晋江镜像</h1>
              <p className="text-xs text-muted-foreground">纯净阅读体验</p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <button onClick={() => setCurrentView('home')} className={`text-sm font-medium hover:text-primary transition-colors ${currentView === 'home' ? 'text-primary' : ''}`}>首页</button>
            <button onClick={() => setCurrentView('library')} className={`text-sm font-medium hover:text-primary transition-colors ${currentView === 'library' ? 'text-primary' : ''}`}>书库</button>
            <span className="text-sm font-medium text-muted-foreground cursor-not-allowed">排行榜</span>
            <span className="text-sm font-medium text-muted-foreground cursor-not-allowed">分类</span>
          </div>

          <div className="flex items-center gap-3">
            <form onSubmit={handleSearch} className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="输入小说ID..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 w-48 lg:w-64"
              />
            </form>

            <Dialog open={kimiDialogOpen} onOpenChange={setKimiDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`hidden sm:inline-flex ${kimiConfigured ? 'text-primary' : 'text-muted-foreground'}`}
                  title="Kimi API 设置"
                >
                  <Sparkles className="w-5 h-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Kimi API Key 设置</DialogTitle>
                  <DialogDescription>
                    配置 Moonshot (Kimi) API Key 以启用智能搜索和推荐功能。
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>获取方式：</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>访问 <a href="https://platform.moonshot.cn" target="_blank" rel="noreferrer" className="text-primary underline">Moonshot 开放平台</a></li>
                      <li>注册并创建 API Key</li>
                      <li>将 Key 粘贴到下方并保存</li>
                    </ol>
                  </div>
                  <Input
                    placeholder="sk-..."
                    value={kimiApiKey}
                    onChange={(e) => setKimiApiKey(e.target.value)}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={handleClearKimiKey}>
                      清除
                    </Button>
                    <Button onClick={handleSaveKimiKey}>
                      保存
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={cookieDialogOpen} onOpenChange={setCookieDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`hidden sm:inline-flex ${hasCookie ? 'text-primary' : 'text-muted-foreground'}`}
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
                    onChange={(e) => handleCookieInputChange(e.target.value)}
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
                    <Button variant="outline" onClick={handleClearCookie}>
                      清除
                    </Button>
                    <Button onClick={handleSaveCookie}>
                      保存
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Button variant="ghost" size="icon" className="hidden sm:inline-flex">
              <User className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {currentView === 'library' && (
          <LibrarySection />
        )}

        {currentView === 'home' && loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">正在加载小说信息...</p>
          </div>
        )}

        {currentView === 'home' && error && !loading && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-8 text-center">
            <p className="text-destructive font-medium mb-2">加载失败</p>
            <p className="text-muted-foreground text-sm mb-4">{error}</p>
            <Button onClick={() => loadNovel(novelId)}>重试</Button>
          </div>
        )}

        {currentView === 'home' && !loading && !error && !novel && (
          <div className="text-center py-20 text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="mb-2">在上方搜索框输入小说 ID 即可开始</p>
            <Button variant="outline" onClick={() => setCurrentView('library')}>去书库看看</Button>
          </div>
        )}

        {currentView === 'home' && !loading && !error && novel && (
          <>
            {/* Novel Header Card */}
            <div className="bg-card rounded-2xl shadow-sm border p-6 mb-8">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Cover */}
                <div className="flex-shrink-0">
                  <div className="w-40 h-56 md:w-48 md:h-72 rounded-xl shadow-inner flex items-center justify-center mx-auto md:mx-0 overflow-hidden relative bg-muted">
                    {((novel as any).cover_url || novel.coverUrl) ? (
                      <img
                        src={((novel as any).cover_url || novel.coverUrl) as string}
                        alt="封面"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="text-center p-4">
                        <BookOpen className="w-12 h-12 text-primary/40 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">封面加载中</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                    <div>
                      <h2 className="text-2xl md:text-3xl font-bold mb-2">{novel.title}</h2>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {novel.author}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-4 h-4" />
                          {novel.chapters.length} 章
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="gap-1">
                        <Heart className="w-4 h-4" />
                        收藏
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1">
                        <Share className="w-4 h-4" />
                        分享
                      </Button>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {novel.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  {/* Summary */}
                  <p className="text-muted-foreground text-sm leading-relaxed mb-6 line-clamp-3">
                    {novel.summary}
                  </p>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-3">
                    <Button
                      size="lg"
                      className="gap-2"
                      onClick={() => startReading(1)}
                    >
                      <BookOpen className="w-5 h-5" />
                      开始阅读
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => startReading(currentChapter)}
                    >
                      继续阅读
                    </Button>
                    <Button variant="outline" size="lg" className="gap-2">
                      <Library className="w-5 h-5" />
                      加入书架
                    </Button>
                  </div>

                  {/* Stats */}
                  <div className="flex flex-wrap gap-6 mt-6 pt-6 border-t">
                    <div className="flex items-center gap-2">
                      <Star className="w-5 h-5 text-yellow-500" />
                      <div>
                        <p className="font-bold">{novel.score ?? '-'}</p>
                        <p className="text-xs text-muted-foreground">评分</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-blue-500" />
                      <div>
                        <p className="font-bold">{novel.click_count != null ? (novel.click_count >= 10000 ? (novel.click_count / 10000).toFixed(1) + '万' : novel.click_count.toLocaleString()) : '-'}</p>
                        <p className="text-xs text-muted-foreground">点击</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Heart className="w-5 h-5 text-red-500" />
                      <div>
                        <p className="font-bold">{novel.collection_count != null ? (novel.collection_count >= 10000 ? (novel.collection_count / 10000).toFixed(1) + '万' : novel.collection_count.toLocaleString()) : '-'}</p>
                        <p className="text-xs text-muted-foreground">收藏</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-green-500" />
                      <div>
                        <p className="font-bold">{novel.update_time?.split(' ')[0] ?? '-'}</p>
                        <p className="text-xs text-muted-foreground">更新</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs Section */}
            <Tabs defaultValue="chapters" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-flex">
                <TabsTrigger value="chapters">章节目录</TabsTrigger>
                <TabsTrigger value="details">作品详情</TabsTrigger>
                <TabsTrigger value="comments">读者评论</TabsTrigger>
              </TabsList>

              <TabsContent value="chapters" className="space-y-4">
                <div className="bg-card rounded-xl border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">章节目录</h3>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">正序</Button>
                      <Button variant="ghost" size="sm">倒序</Button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    {novel.chapters.map((chapter, index) => (
                      <button
                        key={chapter.id}
                        onClick={() => startReading(chapter.id)}
                        className="flex items-center justify-between p-4 rounded-lg border hover:border-primary hover:bg-primary/5 transition-all text-left group"
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-muted-foreground w-8">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span className="font-medium group-hover:text-primary transition-colors">
                            {chapter.title}
                          </span>
                          {chapter.isVip && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">VIP</Badge>
                          )}
                        </div>
                        <BookOpen className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="details">
                <div className="bg-card rounded-xl border p-6">
                  <h3 className="font-semibold mb-4">作品简介</h3>
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    {novel.summary}
                  </p>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">标签</h4>
                      <div className="flex flex-wrap gap-2">
                        {novel.tags.map((tag) => (
                          <Badge key={tag} variant="outline">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                      <div>
                        <p className="text-sm text-muted-foreground">作者</p>
                        <p className="font-medium">{novel.author}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">状态</p>
                        <p className="font-medium">{novel.status || '未知'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">总章节</p>
                        <p className="font-medium">{novel.chapters.length} 章</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">更新时间</p>
                        <p className="font-medium">{novel.update_time?.split(' ')[0] || '-'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="comments">
                <div className="bg-card rounded-xl border p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-semibold">读者评论</h3>
                    <Button>写评论</Button>
                  </div>
                  <div className="space-y-4">
                    {[
                      { user: '书友12345', content: '太好看了！一口气看完三章，根本停不下来！', time: '2小时前', likes: 128 },
                      { user: '夜读人', content: '作者的文笔很好，剧情紧凑，人物塑造也很立体。', time: '5小时前', likes: 86 },
                      { user: '追更党', content: '温简言太帅了！冷静理智，期待后续发展！', time: '1天前', likes: 234 },
                    ].map((comment, index) => (
                      <div key={index} className="p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                              <User className="w-4 h-4 text-primary" />
                            </div>
                            <span className="font-medium">{comment.user}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{comment.time}</span>
                        </div>
                        <p className="text-muted-foreground pl-10">{comment.content}</p>
                        <div className="flex items-center gap-4 pl-10 mt-2">
                          <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors">
                            <Heart className="w-4 h-4" />
                            {comment.likes}
                          </button>
                          <button className="text-sm text-muted-foreground hover:text-primary transition-colors">
                            回复
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/30 mt-12">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              <span className="font-medium">晋江镜像站</span>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              本站点仅为演示用途，所有内容版权归原网站所有
            </p>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <a href="#" className="hover:text-primary transition-colors">关于我们</a>
              <a href="#" className="hover:text-primary transition-colors">联系方式</a>
              <a href="#" className="hover:text-primary transition-colors">免责声明</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
