const { google } = require('googleapis');
const { VertexAI } = require('@google-cloud/vertexai');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const SHEET_ID = '11jM516wdLRtgNqs5-GL1ywlpINeopBTqILWrHDW9dhw';
const SAUNA_SHEET = 'サウナ一覧';
const MANAGE_SHEET = '利用管理';

const vertexAi = new VertexAI({
  project: process.env.GCLOUD_PROJECT,
  location: 'us-central1',
});

const model = vertexAi.preview.getGenerativeModel({
  model: 'gemini-1.0-pro',
  generationConfig: {
    temperature: 0.9,
    maxOutputTokens: 1024,
  },
  safetySettings: [],
});

const sheets = google.sheets('v4');
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

app.post('/search', async (req, res) => {
  try {
    const { userId, area, station, facilityType } = req.body;
    const client = await auth.getClient();

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
        resource: { values: [[userId, 1, today, '無料']] },
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
          resource: { values: [[1]] },
        });
        await sheets.spreadsheets.values.update({
          auth: client,
          spreadsheetId: SHEET_ID,
          range: `${MANAGE_SHEET}!C${idx + 1}`,
          valueInputOption: 'RAW',
          resource: { values: [[today]] },
        });
        count = 1;
      } else {
        let limit = status === '有料' ? 10 : 3;
        if (count >= limit) {
          return res.json({ result: `本日の検索上限に達しています。有料プラン申込をご検討ください（詳細は別途お問い合わせください）` });
        }
        await sheets.spreadsheets.values.update({
          auth: client,
          spreadsheetId: SHEET_ID,
          range: `${MANAGE_SHEET}!B${idx + 1}`,
          valueInputOption: 'RAW',
          resource: { values: [[count + 1]] },
        });
        count++;
      }
    }

    const saunaResp = await sheets.spreadsheets.values.get({
      auth: client,
      spreadsheetId: SHEET_ID,
      range: `${SAUNA_SHEET}!A:N`,
    });
    let saunaRows = saunaResp.data.values;
    let candidates = saunaRows.slice(1).filter(row =>
      (!area || row[2].includes(area)) &&
      (!station || row[4].includes(station)) &&
      (!facilityType || row[5].includes(facilityType))
    );
    if (candidates.length === 0) {
      return res.json({ result: "条件に該当するサウナ施設が見つかりませんでした。" });
    }

    let saunaInfoText = candidates.map(row =>
      `施設名: ${row[1]}\nエリア: ${row[2]}\n路線: ${row[3]}\n最寄駅: ${row[4]}\n施設タイプ: ${row[5]}\n男女利用: ${row[6]}\nHP: ${row[7]}\nInstagram: ${row[8]}\n地図: ${row[9]}`
    ).join('\n---\n');

    let prompt = `下記リストから条件に合うサウナ施設があれば抜き出し、<施設名>・<HP>・<Instagram>・<GoogleMap>を出力してください。もしリストに合うサウナ情報がなければWEBを検索し、施設名など、同様の回答をしてください。\n\n【サウナ情報リスト】\n${saunaInfoText}\n\n【ユーザー条件】エリア:${area} 駅:${station} タイプ:${facilityType}`;

    const response = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
    });

    const aiAnswer = response[0]?.candidates?.[0]?.content?.parts?.[0]?.text || "該当施設なし";
    res.json({ result: aiAnswer });
  } catch (e) {
    console.error('💥 エラー詳細:', e);
    res.status(500).json({ result: "エラーが発生しました", error: e.message || e.toString() });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
