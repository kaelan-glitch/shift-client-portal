import express from 'express';
import { Client } from '@notionhq/client';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

const mockDatabase = new Map();

// --- NOTION API PARSERS ---
async function getNotionDrafts(pageId) {
    if (!process.env.NOTION_TOKEN) {
        return [
            {
                title: "Draft 1 (Video)",
                visualAsset: { type: 'video', url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' },
                caption: "Beat the mid-summer heat with our new Yuzu Cold Brew 🧊🍋\n\nAvailable at our Central and TST locations starting tomorrow!"
            },
            {
                title: "Draft 2 (Drive Link)",
                visualAsset: { type: 'link', url: 'https://drive.google.com' },
                caption: "Alternate caption option focusing on the Ethiopian beans used in our new roast."
            }
        ];
    }

    try {
        const children = await notion.blocks.children.list({ block_id: pageId });
        const draftPages = children.results.filter(b => b.type === 'child_page');
        let drafts = [];
        
        for (const draft of draftPages) {
            const draftBlocks = await notion.blocks.children.list({ block_id: draft.id });
            let visualAsset = null;
            let captionText = [];

            for (const block of draftBlocks.results) {
                if (block.type === 'image') {
                    visualAsset = { type: 'image', url: block.image.file?.url || block.image.external?.url };
                } else if (block.type === 'video') {
                    visualAsset = { type: 'video', url: block.video.file?.url || block.video.external?.url };
                } else if (block.type === 'bookmark') {
                    visualAsset = { type: 'link', url: block.bookmark.url };
                } else if (block.type === 'embed') {
                    visualAsset = { type: 'link', url: block.embed.url };
                } else if (block.type === 'paragraph' && block.paragraph.rich_text.length > 0) {
                    captionText.push(block.paragraph.rich_text.map(t => t.plain_text).join(''));
                }
            }

            drafts.push({
                title: draft.child_page.title,
                visualAsset: visualAsset,
                caption: captionText.join('\n\n') || 'No caption provided.'
            });
        }
        
        if (drafts.length === 0) {
            drafts.push({
                title: "Primary Draft",
                visualAsset: null,
                caption: "Please review the attached content."
            });
        }
        return drafts;
    } catch (error) {
        console.error("Error fetching drafts from Notion:", error);
        return [];
    }
}

// --- HTML TEMPLATES ---
const htmlHead = `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Shift Media - Client Portal</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: { shift: { purple: '#4C34F5', mint: '#5DF2A6' } }
                }
            }
        }
    </script>
`;

function renderVisualAsset(asset) {
    if (!asset) {
        return `<div class="bg-slate-100 flex items-center justify-center h-full min-h-[400px]"><p>No Visual Asset Attached</p></div>`;
    }
    if (asset.type === 'video') {
        return `<video controls class="w-full h-full object-contain bg-black min-h-[400px]"><source src="${asset.url}" type="video/mp4"></video>`;
    }
    if (asset.type === 'link') {
        return `<div class="bg-slate-100 flex flex-col items-center justify-center h-full min-h-[400px]"><a href="${asset.url}" target="_blank" class="text-shift-purple font-bold">View External Asset</a></div>`;
    }
    return `<img src="${asset.url}" class="w-full h-full object-cover min-h-[400px]">`;
}

// --- ROUTES ---
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>${htmlHead}</head>
        <body class="bg-slate-50 flex items-center justify-center min-h-screen">
            <div class="max-w-xl w-full bg-white p-10 shadow-xl border border-slate-200">
                <h1 class="text-3xl font-black text-shift-purple mb-6">SHIFT Automation Engine</h1>
                <form action="/api/send-review" method="POST" class="space-y-4">
                    <input type="text" name="pageId" placeholder="Leave blank for Demo Mode" class="w-full border p-3">
                    <button type="submit" class="w-full bg-shift-purple text-white py-4 font-bold">Generate Link</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

app.post('/api/send-review', async (req, res) => {
    const { pageId } = req.body;
    const token = crypto.randomBytes(16).toString('hex');
    mockDatabase.set(token, { pageId: pageId || 'mock', status: 'Ready' });
    res.redirect(`/review/${token}`);
});

app.get('/review/:token', async (req, res) => {
    const data = mockDatabase.get(req.params.token);
    if (!data) return res.status(404).send('Invalid Link.');

    const drafts = await getNotionDrafts(data.pageId);

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>${htmlHead}</head>
        <body class="bg-shift-purple p-10 flex flex-col items-center">
            <div class="max-w-6xl w-full bg-white p-10 shadow-2xl">
                <h1 class="text-4xl font-bold mb-6">Content Review</h1>
                ${drafts.map((d, i) => `
                    <div class="mb-10 border p-6">
                        <h2 class="text-2xl font-bold mb-4">${d.title}</h2>
                        ${renderVisualAsset(d.visualAsset)}
                        <p class="mt-4 whitespace-pre-wrap">${d.caption}</p>
                    </div>
                `).join('')}
            </div>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Shift Media Portal live at port ${PORT}`));