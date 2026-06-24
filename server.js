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
    // If no credentials, return mock data demonstrating Option A (Tabs) & file types
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
        // 1. Get children of the main page (looking for sub-pages / drafts)
        const children = await notion.blocks.children.list({ block_id: pageId });
        const draftPages = children.results.filter(b => b.type === 'child_page');
        
        let drafts = [];
        
        // 2. Loop through each draft sub-page and extract its content
        for (const draft of draftPages) {
            const draftBlocks = await notion.blocks.children.list({ block_id: draft.id });
            let visualAsset = null;
            let captionText = [];

            for (const block of draftBlocks.results) {
                // Parse Visuals
                if (block.type === 'image') {
                    visualAsset = { type: 'image', url: block.image.file?.url || block.image.external?.url };
                } else if (block.type === 'video') {
                    visualAsset = { type: 'video', url: block.video.file?.url || block.video.external?.url };
                } else if (block.type === 'bookmark') {
                    visualAsset = { type: 'link', url: block.bookmark.url };
                } else if (block.type === 'embed') {
                    visualAsset = { type: 'link', url: block.embed.url };
                }
                // Parse Text
                else if (block.type === 'paragraph' && block.paragraph.rich_text.length > 0) {
                    captionText.push(block.paragraph.rich_text.map(t => t.plain_text).join(''));
                }
            }

            drafts.push({
                title: draft.child_page.title,
                visualAsset: visualAsset,
                caption: captionText.join('\n\n') || 'No caption provided.'
            });
        }
        
        // If no sub-pages exist, fallback to parsing the main page itself
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
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,800;1,900&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: { shift: { purple: '#4C34F5', mint: '#5DF2A6' } },
                    fontFamily: { sans: ['Inter', 'sans-serif'] }
                }
            }
        }
    </script>
`;

function renderVisualAsset(asset) {
    if (!asset) {
        return `
            <div class="bg-white border border-slate-200 shadow-sm overflow-hidden relative flex flex-col items-center justify-center h-full min-h-[400px] rounded-sm p-8 text-center">
                <svg class="w-12 h-12 text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">No Visual Asset Attached</p>
            </div>
        `;
    }
    if (asset.type === 'video') {
        return `
            <div class="bg-black border border-slate-200 shadow-sm overflow-hidden relative flex items-center justify-center h-full min-h-[400px] rounded-sm">
                <video controls class="w-full h-full object-contain absolute inset-0">
                    <source src="${asset.url}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            </div>
        `;
    }
    if (asset.type === 'link') {
        return `
            <div class="bg-white border border-slate-200 shadow-sm overflow-hidden relative flex flex-col items-center justify-center h-full min-h-[400px] rounded-sm p-8 text-center">
                <svg class="w-12 h-12 text-shift-purple mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                <p class="text-slate-600 text-sm font-medium mb-6">This draft includes an external file (e.g. Google Drive).</p>
                <a href="${asset.url}" target="_blank" class="bg-white border-2 border-shift-purple text-shift-purple px-6 py-3 rounded-sm font-bold tracking-widest uppercase text-xs hover:bg-shift-purple hover:text-white transition-colors shadow-sm">
                    View External Asset
                </a>
            </div>
        `;
    }
    return `
        <div class="bg-white border border-slate-200 shadow-sm overflow-hidden relative group h-full min-h-[400px] rounded-sm">
            <img src="${asset.url}" alt="Draft Asset" class="w-full h-full object-cover absolute inset-0">
            <a href="${asset.url}" target="_blank" class="absolute inset-0 bg-shift-purple/10 group-hover:bg-shift-purple/20 transition-colors flex items-center justify-center cursor-pointer">
                <div class="w-16 h-16 bg-white flex items-center justify-center shadow-xl transform group-hover:scale-110 transition-transform rounded-full">
                    <svg class="w-6 h-6 text-shift-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
            </a>
        </div>
    `;
}

// --- ROUTES ---

// 1. Internal Dashboard
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>${htmlHead}</head>
        <body class="bg-slate-50 text-slate-800 font-sans min-h-screen flex items-center justify-center p-6">
            <div class="max-w-xl w-full bg-white p-10 rounded-sm shadow-xl border border-slate-200">
                <div class="mb-8">
                    <div class="text-shift-purple font-black italic text-3xl tracking-tighter mb-2">SHIFT</div>
                    <h1 class="text-xl font-bold tracking-tight text-slate-900">Automation Engine</h1>
                    <p class="text-sm text-slate-500 mt-1">Generate a secure client portal link.</p>
                </div>
                <form action="/api/send-review" method="POST" class="space-y-6">
                    <div>
                        <label class="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Notion Parent Page ID</label>
                        <input type="text" name="pageId" placeholder="e.g. 18e8d89cb256804da643..." class="w-full text-sm border border-slate-200 p-3 rounded-sm focus:ring-2 focus:ring-shift-purple outline-none font-medium text-slate-800">
                        <p class="text-xs text-slate-400 mt-2">Leave blank to test Mock Mode.</p>
                    </div>
                    <button type="submit" class="w-full bg-shift-purple text-white py-4 rounded-sm font-bold tracking-widest uppercase text-xs hover:bg-indigo-700 transition shadow-md">
                        Generate Client Link
                    </button>
                </form>
            </div>
        </body>
        </html>
    `);
});

// 2. Generate Link
app.post('/api/send-review', async (req, res) => {
    const { pageId } = req.body;
    const token = crypto.randomBytes(16).toString('hex');

    if (process.env.NOTION_TOKEN && pageId) {
        try {
            await notion.pages.update({
                page_id: pageId.replace(/-/g, ''),
                properties: {
                    'Review token': { rich_text: [{ text: { content: token } }] },
                    'Status': { select: { name: 'Ready for review' } }
                }
            });
        } catch (error) {
            console.error("Notion Error:", error.message);
        }
    }

    mockDatabase.set(token, { pageId: pageId || 'mock', status: 'Ready for review' });
    res.redirect(`/review/${token}`);
});

// 3. Client Portal Interface (Tabbed Option A)
app.get('/review/:token', async (req, res) => {
    const data = mockDatabase.get(req.params.token);
    if (!data) return res.status(404).send('Link invalid or expired.');

    const drafts = await getNotionDrafts(data.pageId);

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>${htmlHead}</head>
        <body class="bg-shift-purple text-slate-800 font-sans p-4 sm:p-10 flex flex-col items-center justify-center min-h-screen selection:bg-shift-mint selection:text-shift-purple">
            <div class="w-full max-w-6xl mb-6 flex justify-between items-end">
                <div class="text-white font-black italic text-4xl tracking-tighter">SHIFT</div>
                <div class="text-shift-mint font-bold tracking-widest uppercase text-xs sm:text-sm">Client Portal</div>
            </div>

            <div class="max-w-6xl w-full bg-white shadow-2xl overflow-hidden transition-all duration-300 rounded-sm flex flex-col">
                <div class="p-8 sm:p-12 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
                    <div>
                        <h1 class="text-4xl sm:text-5xl font-bold tracking-tighter text-slate-900 mb-2">Content Review.</h1>
                        <p class="text-slate-500 text-lg font-medium">Review your results-driven content.</p>
                    </div>
                    <div class="text-left sm:text-right">
                        <p class="text-xs font-bold uppercase tracking-widest text-shift-purple mb-1">Status</p>
                        <p class="text-sm font-bold text-slate-900 bg-slate-100 px-3 py-1.5 inline-block rounded-sm">Pending Approval</p>
                    </div>
                </div>

                ${drafts.length > 1 ? `
                <div class="px-8 sm:px-12 pt-6 border-b border-slate-100 flex gap-6 overflow-x-auto bg-slate-50">
                    ${drafts.map((d, i) => `
                        <button type="button" onclick="switchTab(${i})" id="tab-btn-${i}" class="pb-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap ${i === 0 ? 'border-shift-purple text-shift-purple' : 'border-transparent text-slate-400 hover:text-slate-700'}">
                            ${d.title}
                        </button>
                    `).join('')}
                </div>
                ` : ''}

                <form action="/review/${req.params.token}/respond" method="POST" id="feedback-form" class="flex-grow">
                    <input type="hidden" id="active-draft-input" name="activeDraft" value="${drafts?.title || 'Primary'}">
                    
                    <div id="draft-containers">
                        ${drafts.map((d, i) => `
                            <div id="draft-pane-${i}" class="grid grid-cols-1 lg:grid-cols-12 gap-0 ${i === 0 ? 'block' : 'hidden'}">
                                
                                <div class="lg:col-span-5 bg-slate-50 p-8 sm:p-12 border-r border-slate-100 flex flex-col">
                                    <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Visual Asset</p>
                                    <div class="flex-grow">
                                        ${renderVisualAsset(d.visualAsset)}
                                    </div>
                                </div>

                                <div class="lg:col-span-7 p-8 sm:p-12 flex flex-col">
                                    <div class="mb-10">
                                        <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Draft Caption</p>
                                        <div class="bg-white border border-slate-200 p-6 rounded-sm text-base text-slate-800 whitespace-pre-wrap leading-relaxed shadow-sm font-medium min-h-[150px]">${d.caption}</div>
                                    </div>
                                    
                                    <div class="flex-grow flex flex-col justify-end space-y-6">
                                        <div>
                                            <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Client Feedback</p>
                                            <textarea name="notes" class="w-full bg-slate-50 border border-slate-200 p-5 rounded-sm h-32 focus:bg-white focus:ring-2 focus:ring-shift-purple focus:border-shift-purple outline-none transition-all resize-none shadow-inner text-sm font-medium" placeholder="Leave specific notes for the editing team here..."></textarea>
                                        </div>
                                        
                                        <div class="flex flex-col sm:flex-row gap-4 pt-2">
                                            <button type="submit" name="action" value="revise" class="w-full sm:w-1/2 bg-white border-2 border-shift-purple text-shift-purple py-4 rounded-sm font-bold tracking-widest uppercase text-xs hover:bg-shift-purple hover:text-white transition-colors active:scale-[0.98] flex items-center justify-center gap-2">
                                                Request Edits
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                                            </button>
                                            
                                            <button type="submit" name="action" value="approve" class="w-full sm:w-1/2 bg-shift-mint text-shift-purple py-4 rounded-sm font-bold tracking-widest uppercase text-xs hover:opacity-90 shadow-lg hover:shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                                                Approve Draft
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        `).join('')}
                    </div>
                </form>
            </div>

            <script>
                const drafts = ${JSON.stringify(drafts.map(d => d.title))};
                function switchTab(index) {
                    document.querySelectorAll('[id^="draft-pane-"]').forEach(el => {
                        el.classList.add('hidden');
                        el.classList.remove('block');
                    });
                    document.getElementById('draft-pane-' + index).classList.remove('hidden');
                    document.getElementById('draft-pane-' + index).classList.add('block');
                    
                    document.querySelectorAll('[id^="tab-btn-"]').forEach(el => {
                        el.classList.remove('border-shift-purple', 'text-shift-purple');
                        el.classList.add('border-transparent', 'text-slate-400');
                    });
                    document.getElementById('tab-btn-' + index).classList.remove('border-transparent', 'text-slate-400');
                    document.getElementById('tab-btn-' + index).classList.add('border-shift-purple', 'text-shift-purple');
                    
                    document.getElementById('active-draft-input').value = drafts[index];
                }
            </script>
        </body>
        </html>
    `);
});

// 4. Handle Feedback Submission
app.post('/review/:token/respond', async (req, res) => {
    const { action, notes, activeDraft } = req.body;
    const data = mockDatabase.get(req.params.token);
    if (!data) return res.status(404).send('Session expired.');

    const isApproved = action === 'approve';
    const statusUpdate = isApproved ? 'Approved' : 'Revisions requested';
    
    // Format notes to include which draft they were looking at
    const finalNotes = `[Ref: ${activeDraft}]\n${notes || (isApproved ? 'Approved with no comments.' : 'Revisions requested.')}`;

    if (process.env.NOTION_TOKEN && data.pageId !== 'mock') {
        try {
            await notion.pages.update({
                page_id: data.pageId.replace(/-/g, ''),
                properties: {
                    'Status': { select: { name: statusUpdate } },
                    'Client notes': { rich_text: [{ text: { content: finalNotes } }] }
                }
            });
        } catch (error) {
            console.error("Notion Update Error:", error.message);
        }
    }

    const iconColor = isApproved ? 'text-shift-mint' : 'text-shift-purple';
    const iconSvg = isApproved 
        ? '<svg class="w-24 h-24 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
        : '<svg class="w-24 h-24 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>';
    
    const title = isApproved ? 'Draft Approved.' : 'Revisions Sent.';
    const message = isApproved 
        ? 'Your content has been locked in and scheduled for publishing.' 
        : 'Your feedback has been synced directly to our editing team.';

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>${htmlHead}</head>
        <body class="bg-shift-purple p-4 sm:p-10 flex items-center justify-center min-h-screen">
            <div class="p-12 md:p-24 text-center bg-white flex flex-col items-center justify-center min-h-[600px] max-w-4xl w-full rounded-sm shadow-2xl">
                <div class="${iconColor} mb-8 transform scale-110">${iconSvg}</div>
                <h2 class="text-5xl font-bold text-slate-900 mb-6 tracking-tighter">${title}</h2>
                <p class="text-slate-500 text-xl mb-10 max-w-md mx-auto font-medium">${message}</p>
                
                ${notes ? `
                <div class="bg-slate-50 border border-slate-200 p-8 text-left text-sm text-slate-700 mb-10 w-full max-w-xl mx-auto rounded-sm">
                    <strong class="text-shift-purple block mb-3 uppercase tracking-widest text-xs">Notes for ${activeDraft}:</strong>
                    <p class="whitespace-pre-wrap font-medium">${notes}</p>
                </div>
                ` : ''}
                <p class="text-xs font-bold uppercase tracking-widest text-slate-400 mt-8">You may now close this window.</p>
            </div>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Shift Media Portal live at http://localhost:${PORT}`));