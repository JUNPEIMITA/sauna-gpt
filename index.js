const { google } = require('googleapis');
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // OpenAI API呼び出し用

const app = express();
app.use(cors());
app.use(express.json());

const SHEET_ID = '11jM516wdLRtgNqs5-GL1ywlpINeopBTqILWrHDW9dhw';
const SAUNA_SHEET = 'サウナ一覧';
const MANAGE_SHEET = '利用管理';

const sheets = google.sheets('v4');
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

app.post('/search', async (req, res) => {
  try {
    const { userId, area, kibun } = req.body;
    const client = await auth.getClient();

    // 利用管理シートのアクセス・回数制限処理はそのまま
    const manageResp = await sheets.spreadsheets.values.get({
      auth: client,
      spreadsheetId: SHEET_ID,
      range: `${MANAGE_SHEET}!A:D`,
    });
    let rows = manageResp.data.values || [];
    let idx = rows.findIndex(row => row[0] === userId);
    let count = 0, status = '無料', lastDate = '', today = new Date().toISOString().slice(0, 10);
    if (idx < 0) {
      await sheets.spreadsheets.values.append({
        auth: client,
        spreadsheetId: SHEET_ID,
        range: MANAGE_SHEET,
        valueInputOption: 'RAW',
        resource: { values: [[userId, 1, today, '無料']] }
      });
      count = 1;
    } else {
      count = parseInt(rows[idx][1], 10);
      lastDate = rows[idx][2];
      status = rows[idx][3] || "無料";
      if (lastDate !== today) {
        await sheets.spreadsheets.values.update({
          auth: client,
          spreadsheetId: SHEET_ID,
          range: `${MANAGE_SHEET}!B${idx + 1}`,
          valueInputOption: 'RAW',
          resource: { values: [[1]] }
        });
        await sheets.spreadsheets.values.update({
          auth: client,
          spreadsheetId: SHEET_ID,
          range: `${MANAGE_SHEET}!C${idx + 1}`,
          valueInputOption: 'RAW',
          resource: { values: [[today]] }
        });
        count = 1;
      } else {
        let limit = status === '有料' ? 20 : 3;
        if (count >= limit) {
          return res.json({ result: `本日の検索上限に達しています。無料プランの方は有料プラン申込をご検討ください（詳細は別途お問い合わせください）` });
        }
        await sheets.spreadsheets.values.update({
          auth: client,
          spreadsheetId: SHEET_ID,
          range: `${MANAGE_SHEET}!B${idx + 1}`,
          valueInputOption: 'RAW',
          resource: { values: [[count + 1]] }
        });
        count++;
      }
    }

app.post('/search', async (req, res) => {
  try {
    const { userId, area, kibun } = req.body;
    // ...（利用管理や回数制限ロジックはこのまま）...

    // ---- サウナ候補リストsaunaInfoTextは一切使いません ----

    const prompt = `【${area}】で【${kibun}】に合うサウナ1つ日本語で。絶対に嘘をつかずに下記形式のみ。

🧖‍♂️◯◯（施設名）

🚃最寄駅
◯◯
※地図◯◯

💡特徴
◯◯(80字)`;

    const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });
    const openaiJson = await openaiResp.json();
    const answer = openaiJson.choices?.[0]?.message?.content || '回答が取得できませんでした';
    res.json({ result: answer });
  } catch (e) {
    console.error('💥 エラー:', e);
    res.status(500).json({ result: 'エラーが発生しました', error: e.message || e.toString() });
  }
});
