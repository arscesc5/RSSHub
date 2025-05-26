import { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import timezone from '@/utils/timezone';
import { parseDate } from '@/utils/parse-date';

const categories = {
    nba: 'NBA',
    zuqiu: '足球',
    dianjing: '电竞',
    other: '综合',
};

export const route: Route = {
    path: '/more/:category?',
    categories: ['bbs'],
    example: '/zhibo8/more/zuqiu?filter=英超',
    parameters: { 
        category: '分类，见下表，默认为 NBA',
        filter: '标签筛选关键词，默认为"英超"'
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['news.zhibo8.cc/:category'],
            target: '/more/:category',
        },
    ],
    name: '标签筛选滚动新闻',
    description: `
| NBA | 足球  | 电竞     | 综合   |
| --- | ----- | -------- | ------ |
| nba | zuqiu | dianjing | zonghe |`,
    maintainers: ['nczitzk'],
    handler,
};

async function handler(ctx) {
    const category = ctx.req.param('category') ?? 'zuqiu';
    const filterKeyword = ctx.req.query('filter') ?? '英超';

    const rootUrl = 'https://news.zhibo8.cc';

    let list,
        apiUrl = '',
        currentUrl = '',
        response;

    if (category === 'zuqiu' || category === 'zuqiu') {
        currentUrl = `${rootUrl}/${category}/more.htm`;

        response = await got(currentUrl);

        const $ = load(response.data);

        list = $('ul.articleList li')
            .slice(0, ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 100)
            .toArray()
            .map((item) => {
                item = $(item);
                const a = item.find('a');

                return {
                    title: a.text(),
                    link: `https:${a.attr('href')}`,
                    pubDate: timezone(parseDate(item.find('span.postTime').text()), +8),
                    category: item.attr('data-label').split(',').filter(Boolean),
                };
            });
    } else {
        currentUrl = `${rootUrl}/${category}`;
        apiUrl = `https://api.qiumibao.com/application/app/index.php?_url=/news/${category}List`;

        response = await got(apiUrl);

        // 注意：如果API返回的数据中没有标签字段，筛选功能对这些分类无效
        list = response.data.data.list.map((item) => ({
            title: item.title,
            link: `https:${item.url}`,
            pubDate: timezone(parseDate(item.createtime), +8),
            // 尝试从标题或其他字段提取标签，或忽略标签筛选
            category: [item.tag || ''], // 根据实际API结构调整
        }));
    }

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const res = await got(item.link);
                const content = load(res.data);

                item.description = content('div.content').html();
                return item;
            })
        )
    );

    // 仅筛选标签中包含关键词的条目
    const filteredItems = items.filter((item) => {
        return item.category?.some(tag => tag.includes(filterKeyword));
    });

    return {
        title: `${categories[category]} - ${filterKeyword}标签筛选 - 直播吧`,
        link: currentUrl,
        item: filteredItems,
    };
}
