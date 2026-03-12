#!/usr/bin/env node
/**
 * build.js - 56_note発信済み/ からフロントマターを抽出し、
 *            note.com API からサムネイルを取得して articles.json を生成
 *
 * 使い方: node build.js [記事フォルダのパス]
 * デフォルト: ../Atama_no_naka4/56_note発信済み/
 */

const fs = require('fs');
const path = require('path');

const SOURCE_DIR = process.argv[2] || path.join(__dirname, '..', 'Atama_no_naka4', '56_note発信済み');
const OUTPUT_FILE = path.join(__dirname, 'articles.json');
const API_BASE = 'https://note.com/api/v2/creators/hiroki_sasazawa/contents?kind=note&page=';

// カテゴリ分類ルール（優先順に判定）
const CATEGORY_RULES = [
  {
    name: '自由進度学習',
    keywords: ['自由進度', '自己調整', '自己調整力'],
    color: '#10b981',
  },
  {
    name: 'AI活用',
    keywords: ['AI', 'Claude', 'ChatGPT', 'Gemini', 'NotebookLM', 'Dify', 'Perplexity', 'Felo', 'LLM'],
    color: '#8b5cf6',
  },
  {
    name: 'GAS・スプレッドシート',
    keywords: ['GAS', 'スプレッドシート', 'Google Apps Script', 'GASSISTANT', 'スプシ', 'Googleフォーム', 'Googleカレンダー', 'googleカレンダー', 'Googleドキュメント', 'googleドキュメント'],
    color: '#f59e0b',
  },
  {
    name: 'アプリ開発',
    keywords: ['アプリ', 'Scratch', 'スクラッチ', 'Cursor', '開発', 'GitHub', 'マークダウン', 'プログラミング'],
    color: '#3b82f6',
  },
  {
    name: '授業実践',
    keywords: ['授業', '学年', '学級', '体育', '社会科', '研修', '国語', '算数', 'Padlet', 'ロイロ', 'Canva', 'Notion', 'ペーパーレス', '研究授業', '教材', '漢字'],
    color: '#ec4899',
  },
  {
    name: '学校運営',
    keywords: ['学校', '校務', '提出物', '欠席', '登校班', '行事', '修学旅行', '検診', '家庭訪問', '通知表', '所見', '懇談会', '参観', '卒業', '人事', '端末', 'タブレット'],
    color: '#06b6d4',
  },
];

const DEFAULT_CATEGORY = { name: 'エッセイ', color: '#6b7280' };

// note.com API から全記事のサムネイルを取得
async function fetchEyecatches() {
  const map = new Map(); // url → eyecatch
  let page = 1;
  let isLastPage = false;

  console.log('note.com API からサムネイルを取得中...');

  while (!isLastPage) {
    const res = await fetch(API_BASE + page);
    if (!res.ok) break;
    const json = await res.json();
    const contents = json.data?.contents || [];

    for (const item of contents) {
      const url = `https://note.com/hiroki_sasazawa/n/${item.key}`;
      if (item.eyecatch) {
        map.set(url, item.eyecatch);
      }
    }

    isLastPage = json.data?.isLastPage || contents.length === 0;
    page++;
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`  ${map.size} 件のサムネイルを取得\n`);
  return map;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const data = {};

  let currentKey = null;
  let inArray = false;

  for (const line of yaml.split('\n')) {
    if (inArray && /^\s+-\s+(.+)/.test(line)) {
      const val = line.match(/^\s+-\s+(.+)/)[1].replace(/^["']|["']$/g, '');
      data[currentKey].push(val);
      continue;
    }

    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)/);
    if (kvMatch) {
      const key = kvMatch[1];
      let value = kvMatch[2].trim();

      if (value.startsWith('[') && value.endsWith(']')) {
        data[key] = value.slice(1, -1).split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        currentKey = key;
        inArray = false;
        continue;
      }

      if (value === '') {
        data[key] = [];
        currentKey = key;
        inArray = true;
        continue;
      }

      data[key] = value.replace(/^["']|["']$/g, '');
      currentKey = key;
      inArray = false;
    }
  }

  return data;
}

function extractDateFromFilename(filename) {
  const match1 = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match1) return match1[1];

  const match2 = filename.match(/^(\d{4})(\d{2})(\d{2})/);
  if (match2) return `${match2[1]}-${match2[2]}-${match2[3]}`;

  return null;
}

function categorize(title) {
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(kw => title.includes(kw))) {
      return { name: rule.name, color: rule.color };
    }
  }
  return DEFAULT_CATEGORY;
}

function buildArticles(eyecatches) {
  const files = fs.readdirSync(SOURCE_DIR)
    .filter(f => f.endsWith('.md'));

  const articles = [];

  for (const file of files) {
    const filepath = path.join(SOURCE_DIR, file);
    const content = fs.readFileSync(filepath, 'utf-8');
    const fm = parseFrontmatter(content);

    let title = fm?.title;
    if (!title) {
      title = file
        .replace(/\.md$/, '')
        .replace(/^\d{4}-\d{2}-\d{2}-/, '')
        .replace(/^\d{8}_/, '')
        .replace(/_/g, ' ');
    }

    let date = fm?.date || extractDateFromFilename(file);
    if (!date) continue;

    const url = fm?.url || fm?.published_url || null;
    const tags = fm?.tags || [];
    const category = categorize(title);

    // サムネイル取得（note.com APIから）
    const eyecatch = url ? (eyecatches.get(url) || null) : null;

    articles.push({
      title,
      date: String(date),
      url,
      eyecatch,
      tags: Array.isArray(tags) ? tags : [],
      category: category.name,
      categoryColor: category.color,
    });
  }

  articles.sort((a, b) => b.date.localeCompare(a.date));
  return articles;
}

async function main() {
  const eyecatches = await fetchEyecatches();
  const articles = buildArticles(eyecatches);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(articles, null, 2), 'utf-8');

  const stats = {};
  for (const a of articles) {
    stats[a.category] = (stats[a.category] || 0) + 1;
  }

  const withThumb = articles.filter(a => a.eyecatch).length;

  console.log(`✅ ${articles.length}件の記事を articles.json に出力しました`);
  console.log('\nカテゴリ別:');
  for (const [cat, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}件`);
  }
  console.log(`\n  URL付き: ${articles.filter(a => a.url).length}件`);
  console.log(`  URLなし: ${articles.filter(a => !a.url).length}件`);
  console.log(`  サムネイル付き: ${withThumb}件`);
}

main().catch(console.error);
