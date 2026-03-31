import { useState } from 'react';
import { BookOpen, Search, Library, User, Star, TrendingUp, Clock, Heart, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Reader from '@/sections/Reader';
import { novelData } from '@/data/novelData';
import './App.css';

function App() {
  const [isReading, setIsReading] = useState(false);
  const [currentChapter, setCurrentChapter] = useState(1);

  const startReading = (chapterId: number = 1) => {
    setCurrentChapter(chapterId);
    setIsReading(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (isReading) {
    return <Reader initialChapter={currentChapter} />;
  }

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
            <a href="#" className="text-sm font-medium hover:text-primary transition-colors">首页</a>
            <a href="#" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">书库</a>
            <a href="#" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">排行榜</a>
            <a href="#" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">分类</a>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="搜索小说..." 
                className="pl-9 w-48 lg:w-64"
              />
            </div>
            <Button variant="ghost" size="icon" className="hidden sm:inline-flex">
              <User className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Novel Header Card */}
        <div className="bg-card rounded-2xl shadow-sm border p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Cover */}
            <div className="flex-shrink-0">
              <div className="w-40 h-56 md:w-48 md:h-72 bg-gradient-to-br from-primary/20 via-primary/10 to-muted rounded-xl shadow-inner flex items-center justify-center mx-auto md:mx-0">
                <div className="text-center p-4">
                  <BookOpen className="w-12 h-12 text-primary/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">封面加载中</p>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold mb-2">{novelData.title}</h2>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      {novelData.author}
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-4 h-4" />
                      {novelData.chapters.length} 章
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
                {novelData.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                    {tag}
                  </Badge>
                ))}
              </div>

              {/* Summary */}
              <p className="text-muted-foreground text-sm leading-relaxed mb-6 line-clamp-3">
                {novelData.summary}
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
                    <p className="font-bold">9.8</p>
                    <p className="text-xs text-muted-foreground">评分</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className="font-bold">12.5万</p>
                    <p className="text-xs text-muted-foreground">点击</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-red-500" />
                  <div>
                    <p className="font-bold">8.3万</p>
                    <p className="text-xs text-muted-foreground">收藏</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="font-bold">2025-09-29</p>
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
                {novelData.chapters.map((chapter, index) => (
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
                {novelData.summary}
              </p>
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">标签</h4>
                  <div className="flex flex-wrap gap-2">
                    {novelData.tags.map((tag) => (
                      <Badge key={tag} variant="outline">{tag}</Badge>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-sm text-muted-foreground">作者</p>
                    <p className="font-medium">{novelData.author}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">状态</p>
                    <p className="font-medium">连载中</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">总章节</p>
                    <p className="font-medium">{novelData.chapters.length} 章</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">更新时间</p>
                    <p className="font-medium">2025-09-29</p>
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
