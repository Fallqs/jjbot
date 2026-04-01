import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Download,
  Trash2,
  BookOpen,
  User,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface Novel {
  id: string;
  title: string;
  author: string;
  summary: string;
  tags: string[];
  status: string;
  word_count: number | null;
  chapter_count: number | null;
  score: number | null;
  update_time: string;
  cover_url: string;
}

export default function Library() {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [popularTags, setPopularTags] = useState<{ name: string; count: number }[]>([]);
  const [stats, setStats] = useState({ total: 0, lastSynced: null as number | null });

  const [crawlMode, setCrawlMode] = useState<'ids' | 'bookbase'>('ids');
  const [crawlInput, setCrawlInput] = useState('');
  const [crawlLoading, setCrawlLoading] = useState(false);
  const [crawlResult, setCrawlResult] = useState<{ saved: number; failed: number } | null>(null);

  const [bookbaseStart, setBookbaseStart] = useState('1');
  const [bookbaseEnd, setBookbaseEnd] = useState('5');
  const [bookbaseResult, setBookbaseResult] = useState<{ collected?: number; saved?: number; failed?: number } | null>(null);

  const [syncLoading, setSyncLoading] = useState(false);
  const [detailSyncLoading, setDetailSyncLoading] = useState(false);
  const [missingDetailsCount, setMissingDetailsCount] = useState(0);

  const [kimiQuery, setKimiQuery] = useState('');
  const [kimiLoading, setKimiLoading] = useState(false);

  const [recommendLoading, setRecommendLoading] = useState(false);

  const [aiResults, setAiResults] = useState<{
    type: 'search' | 'recommend';
    items: { novel: Novel; reason: string }[];
  } | null>(null);

  const fetchNovels = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword) params.set('keyword', keyword);
      if (selectedTags.length > 0) params.set('tags', selectedTags.join(','));
      params.set('limit', '50');
      const res = await fetch(`/api/novels?${params.toString()}`);
      const data = await res.json();
      setNovels(data.novels || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [keyword, selectedTags]);

  const fetchStats = useCallback(async () => {
    try {
      const [statsRes, tagsRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/tags/popular?limit=20'),
      ]);
      const statsData = await statsRes.json();
      const tagsData = await tagsRes.json();
      setStats(statsData);
      setPopularTags(tagsData || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchMissingDetails = useCallback(async () => {
    try {
      // We'll infer from current novels list for simplicity, or just count empty summaries in loaded novels
      const res = await fetch('/api/novels?limit=1000');
      const data = await res.json();
      const count = (data.novels || []).filter((n: Novel) => !n.summary).length;
      setMissingDetailsCount(count);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchNovels();
    fetchStats();
    fetchMissingDetails();
  }, [fetchNovels, fetchStats, fetchMissingDetails]);

  const handleCrawl = async () => {
    const text = crawlInput.trim();
    if (!text) return;

    setCrawlLoading(true);
    setCrawlResult(null);

    let ids: string[] = [];
    let range: { start: number; end: number } | undefined;

    if (text.includes('-')) {
      const [startStr, endStr] = text.split('-');
      const start = parseInt(startStr.trim(), 10);
      const end = parseInt(endStr.trim(), 10);
      if (!isNaN(start) && !isNaN(end) && end >= start) {
        range = { start, end };
      }
    } else {
      ids = text.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean);
    }

    try {
      const res = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids.length ? ids : undefined, range, delayMs: 200 }),
      });
      const data = await res.json();
      setCrawlResult({ saved: data.saved || 0, failed: data.failed || 0 });
      fetchNovels();
      fetchStats();
    } catch (e) {
      console.error(e);
    } finally {
      setCrawlLoading(false);
    }
  };

  const handleBookbaseCrawl = async () => {
    const start = parseInt(bookbaseStart.trim(), 10);
    const end = parseInt(bookbaseEnd.trim(), 10);
    if (isNaN(start) || isNaN(end) || end < start) return;

    setCrawlLoading(true);
    setBookbaseResult(null);

    try {
      const res = await fetch('/api/crawl/bookbase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startPage: start, endPage: end, delayMs: 200, autoCrawlDetails: true }),
      });
      const data = await res.json();
      setBookbaseResult({ collected: data.collected, saved: data.saved, failed: data.failed });
      fetchNovels();
      fetchStats();
    } catch (e) {
      console.error(e);
    } finally {
      setCrawlLoading(false);
    }
  };

  const handleSyncAll = async () => {
    setSyncLoading(true);
    try {
      await fetch('/api/sync/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delayMs: 200 }),
      });
      fetchNovels();
      fetchStats();
      fetchMissingDetails();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleDetailSync = async () => {
    setDetailSyncLoading(true);
    try {
      await fetch('/api/sync/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100, delayMs: 200 }),
      });
      fetchNovels();
      fetchStats();
      fetchMissingDetails();
    } catch (e) {
      console.error(e);
    } finally {
      setDetailSyncLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要从本地库删除这本小说吗？')) return;
    try {
      await fetch(`/api/novels/${id}`, { method: 'DELETE' });
      fetchNovels();
      fetchStats();
    } catch (e) {
      console.error(e);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleKimiSearch = async () => {
    if (!kimiQuery.trim()) return;
    setKimiLoading(true);
    try {
      const res = await fetch('/api/search/kimi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: kimiQuery.trim(), candidateLimit: 20 }),
      });
      const data = await res.json();
      if (data.novels && Array.isArray(data.novels)) {
        const reasons = new Map<string, string>(
          data.novels.map((n: { novel_id: string; reason: string }) => [n.novel_id, n.reason])
        );
        const ids = data.novels.map((n: { novel_id: string }) => n.novel_id);
        const fetched = await Promise.all(
          ids.map((id: string) => fetch(`/api/novels/${id}`).then(r => r.json()))
        );
        const valid = fetched
          .filter((n: Novel) => n && n.id)
          .map((n: Novel) => ({ novel: n, reason: reasons.get(n.id) || '' }));
        setAiResults({ type: 'search', items: valid });
      } else if (data.text) {
        // fallback plain text
        alert(data.text);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setKimiLoading(false);
    }
  };

  const handleKimiRecommend = async () => {
    setRecommendLoading(true);
    try {
      const res = await fetch('/api/recommend/kimi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateLimit: 20 }),
      });
      const data = await res.json();
      if (data.novels && Array.isArray(data.novels)) {
        const reasons = new Map<string, string>(
          data.novels.map((n: { novel_id: string; reason: string }) => [n.novel_id, n.reason])
        );
        const ids = data.novels.map((n: { novel_id: string }) => n.novel_id);
        const fetched = await Promise.all(
          ids.map((id: string) => fetch(`/api/novels/${id}`).then(r => r.json()))
        );
        const valid = fetched
          .filter((n: Novel) => n && n.id)
          .map((n: Novel) => ({ novel: n, reason: reasons.get(n.id) || '' }));
        setAiResults({ type: 'recommend', items: valid });
      } else if (data.text) {
        alert(data.text);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRecommendLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <BookOpen className="w-6 h-6 text-primary" />
                本地书库
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                共收录 {stats.total} 本小说
                {stats.lastSynced && (
                  <span className="ml-2">
                    · 上次同步 {new Date(stats.lastSynced).toLocaleString()}
                  </span>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSyncAll} disabled={syncLoading}>
                {syncLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span className="ml-1 hidden sm:inline">全库同步</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleDetailSync} disabled={detailSyncLoading || missingDetailsCount === 0} title={`${missingDetailsCount} 本缺少简介`}>
                {detailSyncLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span className="ml-1 hidden sm:inline">补齐详情</span>
                {missingDetailsCount > 0 && (
                  <span className="ml-1 text-[10px] bg-primary/20 text-primary px-1.5 rounded-full">{missingDetailsCount}</span>
                )}
              </Button>
              <Button variant="outline" size="sm" onClick={handleKimiRecommend} disabled={recommendLoading}>
                {recommendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span className="ml-1 hidden sm:inline">智能推荐</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Crawl Panel */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex gap-2 border-b pb-2">
              <button
                onClick={() => setCrawlMode('ids')}
                className={`text-sm font-medium px-3 py-1 rounded ${crawlMode === 'ids' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                按ID爬取
              </button>
              <button
                onClick={() => setCrawlMode('bookbase')}
                className={`text-sm font-medium px-3 py-1 rounded ${crawlMode === 'bookbase' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                按作品库翻页
              </button>
            </div>

            {crawlMode === 'ids' && (
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-1 block">批量爬取小说</label>
                  <Input
                    placeholder="输入小说ID，支持逗号分隔或范围（如 5484954-5485000）"
                    value={crawlInput}
                    onChange={(e) => setCrawlInput(e.target.value)}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={handleCrawl} disabled={crawlLoading || !crawlInput.trim()}>
                    {crawlLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    <span className="ml-1">开始爬取</span>
                  </Button>
                </div>
              </div>
            )}

            {crawlMode === 'bookbase' && (
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-1 block">作品库翻页爬取</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={1}
                      placeholder="起始页"
                      value={bookbaseStart}
                      onChange={(e) => setBookbaseStart(e.target.value)}
                    />
                    <span className="py-2 text-muted-foreground">-</span>
                    <Input
                      type="number"
                      min={1}
                      placeholder="结束页"
                      value={bookbaseEnd}
                      onChange={(e) => setBookbaseEnd(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">每页约 100 本小说，单次最多 100 页</p>
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={handleBookbaseCrawl} disabled={crawlLoading || !bookbaseStart.trim() || !bookbaseEnd.trim()}>
                    {crawlLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    <span className="ml-1">开始爬取</span>
                  </Button>
                </div>
              </div>
            )}

            {crawlResult && crawlMode === 'ids' && (
              <p className="text-sm text-muted-foreground">
                爬取完成：成功 {crawlResult.saved} 本，失败 {crawlResult.failed} 本
              </p>
            )}
            {bookbaseResult && crawlMode === 'bookbase' && (
              <p className="text-sm text-muted-foreground">
                翻页采集到 {bookbaseResult.collected} 本，入库 {bookbaseResult.saved} 本，失败 {bookbaseResult.failed} 本
              </p>
            )}
          </CardContent>
        </Card>

        {/* Kimi Search */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1">
                <label className="text-sm font-medium mb-1 block flex items-center gap-1">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Kimi 智能搜索
                </label>
                <Input
                  placeholder="用自然语言描述你想看的小说，例如：无限流、主角智商在线的耽美小说"
                  value={kimiQuery}
                  onChange={(e) => setKimiQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleKimiSearch()}
                />
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={handleKimiSearch} disabled={kimiLoading || !kimiQuery.trim()}>
                  {kimiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span className="ml-1">搜索</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索书名、简介..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="pl-9 w-full"
            />
          </div>
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedTags.map(tag => (
                <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => toggleTag(tag)}>
                  {tag} <X className="w-3 h-3 ml-1" />
                </Badge>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setSelectedTags([])}>清除筛选</Button>
            </div>
          )}
        </div>

        {/* Popular Tags */}
        {popularTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-muted-foreground py-1">热门标签：</span>
            {popularTags.map(tag => (
              <Badge
                key={tag.name}
                variant={selectedTags.includes(tag.name) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => toggleTag(tag.name)}
              >
                {tag.name} ({tag.count})
              </Badge>
            ))}
          </div>
        )}

        {/* AI Results */}
        {aiResults && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                {aiResults.type === 'search' ? 'Kimi 智能搜索结果' : 'Kimi 智能推荐'}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setAiResults(null)}>
                <X className="w-4 h-4 mr-1" /> 清除
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {aiResults.items.map(({ novel, reason }) => (
                <Card key={novel.id} className="overflow-hidden hover:shadow-md transition-shadow border-primary/30 cursor-pointer" onClick={() => { window.open(`?novel=${novel.id}`, '_blank'); fetch(`/api/novels/${novel.id}/sync`, { method: 'POST' }); }}>
                  <CardContent className="p-0">
                    <div className="flex gap-4 p-4">
                      <div
                        className="w-24 h-32 bg-muted rounded flex-shrink-0 bg-cover bg-center"
                        style={{ backgroundImage: novel.cover_url ? `url(${novel.cover_url})` : undefined }}
                      >
                        {!novel.cover_url && (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                            无封面
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold truncate" title={novel.title}>{novel.title}</h3>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                          <User className="w-3 h-3" />
                          <span className="truncate">{novel.author || '未知作者'}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          {novel.status && <Badge variant="secondary" className="text-[10px]">{novel.status}</Badge>}
                          {novel.word_count != null && <span>{novel.word_count.toLocaleString()} 字</span>}
                          {novel.chapter_count != null && <span>{novel.chapter_count} 章</span>}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {novel.tags?.slice(0, 4).map(tag => (
                            <Badge key={tag} variant="outline" className="text-[10px] cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleTag(tag); }}>
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="px-4 pb-2">
                      <p className="text-xs text-primary font-medium line-clamp-2">{reason}</p>
                    </div>
                    <div className="px-4 pb-2">
                      <p className="text-xs text-muted-foreground line-clamp-2">{novel.summary}</p>
                    </div>
                    <div className="flex items-center justify-end px-4 py-3 bg-muted/30 border-t">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(novel.id); }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Novel Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : novels.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>书库为空，快去批量爬取小说吧</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">共 {total} 条结果</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {novels.map(novel => (
                <Card key={novel.id} className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer" onClick={() => { window.open(`?novel=${novel.id}`, '_blank'); fetch(`/api/novels/${novel.id}/sync`, { method: 'POST' }); }}>
                  <CardContent className="p-0">
                    <div className="flex gap-4 p-4">
                      <div
                        className="w-24 h-32 bg-muted rounded flex-shrink-0 bg-cover bg-center"
                        style={{ backgroundImage: novel.cover_url ? `url(${novel.cover_url})` : undefined }}
                      >
                        {!novel.cover_url && (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                            无封面
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold truncate" title={novel.title}>{novel.title}</h3>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                          <User className="w-3 h-3" />
                          <span className="truncate">{novel.author || '未知作者'}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          {novel.status && <Badge variant="secondary" className="text-[10px]">{novel.status}</Badge>}
                          {novel.word_count != null && <span>{novel.word_count.toLocaleString()} 字</span>}
                          {novel.chapter_count != null && <span>{novel.chapter_count} 章</span>}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {novel.tags?.slice(0, 4).map(tag => (
                            <Badge key={tag} variant="outline" className="text-[10px] cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleTag(tag); }}>
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="px-4 pb-2">
                      <p className="text-xs text-muted-foreground line-clamp-2">{novel.summary}</p>
                    </div>
                    <div className="flex items-center justify-end px-4 py-3 bg-muted/30 border-t">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(novel.id); }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
