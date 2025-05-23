{\rtf1\ansi\ansicpg932\cocoartf2822
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww24680\viewh22160\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 const functions = require('@google-cloud/functions-framework');\
const \{ google \} = require('googleapis');\
const \{ VertexAI \} = require('@google-cloud/vertexai');\
const express = require('express');\
const cors = require('cors');\
\
const app = express();\
app.use(cors());\
app.use(express.json());\
\
const SHEET_ID = '11jM516wdLRtgNqs5-GL1ywlpINeopBTqILWrHDW9dhw'; // \uc0\u12469 \u12454 \u12490 DB\u12473 \u12503 \u12524 \u12483 \u12489 \u12471 \u12540 \u12488 ID\
const SAUNA_SHEET = '\uc0\u12469 \u12454 \u12490 \u19968 \u35239 ';\
const MANAGE_SHEET = '\uc0\u21033 \u29992 \u31649 \u29702 ';\
\
// Vertex AI\uc0\u12475 \u12483 \u12488 \u12450 \u12483 \u12503 \u65288 Gemini\u29992 \u65289 \
const vertexAi = new VertexAI(\{\
  project: process.env.GCLOUD_PROJECT,\
  location: 'us-central1', // \uc0\u26481 \u20140 \u26410 \u23550 \u24540 \u26178 \u12399 us-central1\u12391 OK\
\});\
const model = 'gemini-1.0-pro';\
\
// Google Sheets\uc0\u35469 \u35388 \
const sheets = google.sheets('v4');\
const auth = new google.auth.GoogleAuth(\{\
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),\
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],\
\});\
\
// \uc0\u12469 \u12454 \u12490 \u26908 \u32034 API\
app.post('/search', async (req, res) => \{\
  try \{\
    const \{ userId, area, station, facilityType \} = req.body;\
    const client = await auth.getClient();\
\
    // \uc0\u21033 \u29992 \u31649 \u29702 DB\u12481 \u12455 \u12483 \u12463 \u12539 \u12459 \u12454 \u12531 \u12488 \u12450 \u12483 \u12503 \
    const manageResp = await sheets.spreadsheets.values.get(\{\
      auth: client,\
      spreadsheetId: SHEET_ID,\
      range: `$\{MANAGE_SHEET\}!A:D`,\
    \});\
    let rows = manageResp.data.values || [];\
    let idx = rows.findIndex(row => row[0] === userId);\
    let count = 0, status = '\uc0\u28961 \u26009 ', lastDate = '', today = new Date().toISOString().slice(0,10);\
    if (idx < 0) \{\
      await sheets.spreadsheets.values.append(\{\
        auth: client,\
        spreadsheetId: SHEET_ID,\
        range: MANAGE_SHEET,\
        valueInputOption: 'RAW',\
        resource: \{ values: [[userId, 1, today, '\uc0\u28961 \u26009 ']] \}\
      \});\
      count = 1;\
    \} else \{\
      count = parseInt(rows[idx][1], 10);\
      lastDate = rows[idx][2];\
      status = rows[idx][3] || "\uc0\u28961 \u26009 ";\
      if (lastDate !== today) \{\
        await sheets.spreadsheets.values.update(\{\
          auth: client,\
          spreadsheetId: SHEET_ID,\
          range: `$\{MANAGE_SHEET\}!B$\{idx+1\}`,\
          valueInputOption: 'RAW',\
          resource: \{ values: [[1]] \}\
        \});\
        await sheets.spreadsheets.values.update(\{\
          auth: client,\
          spreadsheetId: SHEET_ID,\
          range: `$\{MANAGE_SHEET\}!C$\{idx+1\}`,\
          valueInputOption: 'RAW',\
          resource: \{ values: [[today]] \}\
        \});\
        count = 1;\
      \} else \{\
        let limit = status === '\uc0\u26377 \u26009 ' ? 10 : 3;\
        if (count >= limit) \{\
          return res.json(\{ result: `\uc0\u26412 \u26085 \u12398 \u26908 \u32034 \u19978 \u38480 \u12395 \u36948 \u12375 \u12390 \u12356 \u12414 \u12377 \u12290 \u26377 \u26009 \u12503 \u12521 \u12531 \u30003 \u36796 \u12434 \u12372 \u26908 \u35342 \u12367 \u12384 \u12373 \u12356 \u65288 \u35443 \u32048 \u12399 \u21029 \u36884 \u12362 \u21839 \u12356 \u21512 \u12431 \u12379 \u12367 \u12384 \u12373 \u12356 \u65289 ` \});\
        \}\
        await sheets.spreadsheets.values.update(\{\
          auth: client,\
          spreadsheetId: SHEET_ID,\
          range: `$\{MANAGE_SHEET\}!B$\{idx+1\}`,\
          valueInputOption: 'RAW',\
          resource: \{ values: [[count+1]] \}\
        \});\
        count++;\
      \}\
    \}\
\
    // \uc0\u12469 \u12454 \u12490 \u19968 \u35239 \u21462 \u24471 \
    const saunaResp = await sheets.spreadsheets.values.get(\{\
      auth: client,\
      spreadsheetId: SHEET_ID,\
      range: `$\{SAUNA_SHEET\}!A:N`\
    \});\
    let saunaRows = saunaResp.data.values;\
    let candidates = saunaRows.slice(1).filter(row =>\
      (!area || row[2].includes(area)) &&\
      (!station || row[4].includes(station)) &&\
      (!facilityType || row[5].includes(facilityType))\
    );\
    if (candidates.length === 0) \{\
      return res.json(\{ result: "\uc0\u26465 \u20214 \u12395 \u35442 \u24403 \u12377 \u12427 \u12469 \u12454 \u12490 \u26045 \u35373 \u12364 \u35211 \u12388 \u12363 \u12426 \u12414 \u12379 \u12435 \u12391 \u12375 \u12383 \u12290 " \});\
    \}\
\
    // Gemini\uc0\u12503 \u12525 \u12531 \u12503 \u12488 \
    let saunaInfoText = candidates.map(row =>\
      `\uc0\u26045 \u35373 \u21517 : $\{row[1]\}\\n\u12456 \u12522 \u12450 : $\{row[2]\}\\n\u36335 \u32218 : $\{row[3]\}\\n\u26368 \u23492 \u39365 : $\{row[4]\}\\n\u26045 \u35373 \u12479 \u12452 \u12503 : $\{row[5]\}\\n\u30007 \u22899 \u21033 \u29992 : $\{row[6]\}\\nHP: $\{row[7]\}\\nInstagram: $\{row[8]\}\\n\u22320 \u22259 : $\{row[9]\}`\
    ).join('\\n---\\n');\
    let prompt = `\uc0\u19979 \u35352 \u12522 \u12473 \u12488 \u12363 \u12425 \u26465 \u20214 \u12395 \u21512 \u12358 \u12469 \u12454 \u12490 \u26045 \u35373 \u12364 \u12354 \u12428 \u12400 \u25244 \u12365 \u20986 \u12375 \u12289 <\u26045 \u35373 \u21517 >\u12539 <HP>\u12539 <Instagram>\u12539 <GoogleMap>\u12434 \u20986 \u21147 \u12375 \u12390 \u12367 \u12384 \u12373 \u12356 \u12290 \u12418 \u12375 \u12522 \u12473 \u12488 \u12395 \u21512 \u12358 \u12469 \u12454 \u12490 \u24773 \u22577 \u12364 \u12394 \u12369 \u12428 \u12400 WEB\u12434 \u26908 \u32034 \u12375 \u12289 \u26045 \u35373 \u21517 \u12394 \u12393 \u12289 \u21516 \u27096 \u12398 \u22238 \u31572 \u12434 \u12375 \u12390 \u12367 \u12384 \u12373 \u12356 \u12290 \\n\\n\u12304 \u12469 \u12454 \u12490 \u24773 \u22577 \u12522 \u12473 \u12488 \u12305 \\n$\{saunaInfoText\}\\n\\n\u12304 \u12518 \u12540 \u12470 \u12540 \u26465 \u20214 \u12305 \u12456 \u12522 \u12450 :$\{area\} \u39365 :$\{station\} \u12479 \u12452 \u12503 :$\{facilityType\}`;\
\
    // Gemini\uc0\u12408 \u12522 \u12463 \u12456 \u12473 \u12488 \
    const endpoint = `projects/$\{process.env.GCLOUD_PROJECT\}/locations/us-central1/publishers/google/models/gemini-1.0-pro:generateContent`;\
    const [result] = await vertexAi.getGenerativeModel(\{ model \}).generateContent(\{\
      contents: [\
        \{ role: "user", parts: [\{ text: prompt \}] \}\
      ]\
    \});\
    const aiAnswer = result.candidates?.[0]?.content?.parts?.[0]?.text || "\uc0\u35442 \u24403 \u26045 \u35373 \u12394 \u12375 ";\
\
    res.json(\{ result: aiAnswer \});\
  \} catch (e) \{\
    console.error(e);\
    res.status(500).json(\{ result: "\uc0\u12456 \u12521 \u12540 \u12364 \u30330 \u29983 \u12375 \u12414 \u12375 \u12383 " \});\
  \}\
\});\
\
functions.http('api', app);\
}