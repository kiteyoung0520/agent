const PPT_THEMES = {
    modern_blue:  { colors: { background: "#0f172a", text: "#f8fafc", accent: "#38bdf8", shape: "#1e293b" } }
};

const AGENT_TOOLS = [{
    functionDeclarations: [
        { 
            name: "create_calendar_event", 
            description: "建立單一行事曆行程。若使用者要求邀請或共用給某人，請提供 guests 參數。若指定特定行事曆名稱(如'工作')，請提供 calendarName。", 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    title: { type: "STRING" }, 
                    startTime: { type: "STRING", description: "開始時間，請嚴格使用 ISO 8601 格式" }, 
                    endTime: { type: "STRING", description: "結束時間，請嚴格使用 ISO 8601 格式" }, 
                    description: { type: "STRING" },
                    calendarName: { type: "STRING", description: "使用者指定的行事曆名稱 (例如 '工作', '家庭' 等)。若未指定則留空。" },
                    guests: { type: "STRING", description: "要邀請或共用的與會者 Email，如果有多個請用半形逗號分隔 (例如: a@gmail.com, b@gmail.com)" }
                }, 
                required: ["title", "startTime"] 
            } 
        },
        { name: "batch_create_calendar_events", description: "批次建立行程", parameters: { type: "OBJECT", properties: { eventsData: { type: "STRING" } }, required: ["eventsData"] } },
        { name: "get_calendar_events", description: "查詢行事曆", parameters: { type: "OBJECT", properties: { startDate: { type: "STRING" }, endDate: { type: "STRING" } }, required: ["startDate", "endDate"] } },
        { name: "add_event_reminder", description: "為特定的行事曆行程新增彈出視窗提醒。", parameters: { type: "OBJECT", properties: { eventId: { type: "STRING" }, minutesBefore: { type: "NUMBER" } }, required: ["eventId", "minutesBefore"] } },
        { name: "read_unread_emails", description: "讀取收件匣中尚未閱讀的信件摘要。", parameters: { type: "OBJECT", properties: { limit: { type: "NUMBER" } } } },
        { name: "send_email_or_draft", description: "寄送電子郵件或建立草稿。", parameters: { type: "OBJECT", properties: { recipient: { type: "STRING" }, subject: { type: "STRING" }, body: { type: "STRING" }, isDraft: { type: "BOOLEAN" } }, required: ["recipient", "subject", "body"] } },
        
        { 
            name: "create_survey_form", 
            description: "建立 Google 表單 (Google Forms)。⚠️ 強制要求：當使用者要求建立表單時，請務必『立刻』呼叫此工具，絕對不能只用文字回覆。", 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    title: { type: "STRING", description: "表單標題" }, 
                    description: { type: "STRING", description: "表單描述" }, 
                    questions: { 
                        type: "ARRAY", 
                        description: "表單題目列表陣列", 
                        items: {
                            type: "OBJECT",
                            properties: {
                                title: { type: "STRING", description: "題目" },
                                type: { type: "STRING", description: "題型(大寫英文)：TEXT, PARAGRAPH, MULTIPLE_CHOICE, CHECKBOX, LIST, SCALE, DATE, TIME" },
                                choices: { type: "ARRAY", items: { type: "STRING" }, description: "選擇題的選項" },
                                required: { type: "BOOLEAN", description: "是否必填" }
                            },
                            required: ["title", "type"]
                        }
                    } 
                }, 
                required: ["title", "questions"] 
            } 
        },
        
        { name: "create_drive_folder", description: "在 Google 雲端硬碟中建立新的資料夾。", parameters: { type: "OBJECT", properties: { folderName: { type: "STRING", description: "要建立的資料夾名稱" }, parentFolderUrl: { type: "STRING", description: "可選。父資料夾的完整網址，若不提供則建立在根目錄" } }, required: ["folderName"] } },
        
        { name: "search_drive_files", description: "【全文檢索】搜尋 Google 雲端硬碟中的檔案。支援深度全文檢索（包含標題與內文）。支援分頁機制，若回傳結果包含 nextPageToken，表示還有更多檔案，請在後續呼叫帶入 pageToken 繼續搜尋。", parameters: { type: "OBJECT", properties: { keyword: { type: "STRING", description: "搜尋關鍵字 (AI 可針對概念進行搜尋)" }, fileType: { type: "STRING", description: "可選。過濾檔案類型，例如 'document', 'spreadsheet', 'folder', 'pdf'" }, folderId: { type: "STRING", description: "可選。指定要在哪個資料夾內搜尋 (填入資料夾 ID 或網址)。若要搜尋特定資料夾內的檔案，請填入此參數。" }, pageToken: { type: "STRING", description: "可選。獲取下一頁結果的 Token" }, maxResults: { type: "NUMBER", description: "可選。單次獲取最大數量，預設 30" } }, required: ["keyword"] } },
        { name: "scan_and_prepare_archive", description: "【安全歸檔模式】搜尋大量散落的檔案並建立專屬資料夾，但「不主動搬移」。支援分頁機制，若回傳結果包含 nextPageToken，表示還有更多檔案未顯示。", parameters: { type: "OBJECT", properties: { keyword: { type: "STRING", description: "要整理的主題關鍵字，如 'SEL'" }, pageToken: { type: "STRING", description: "可選。獲取下一頁結果的 Token" } }, required: ["keyword"] } },
        
        { name: "move_drive_file", description: "【精準搬移】將特定的單一檔案移動到指定的資料夾中。如果目標資料夾不存在會自動建立。當使用者明確要求「把某個檔案放進某個資料夾」時強制呼叫此工具。", parameters: { type: "OBJECT", properties: { fileIdentifier: { type: "STRING", description: "要移動的檔案名稱或完整網址" }, folderIdentifier: { type: "STRING", description: "目標資料夾的名稱或完整網址" } }, required: ["fileIdentifier", "folderIdentifier"] } },
        
        { name: "read_drive_file", description: "【強制呼叫】讀取 Google 雲端硬碟檔案內容。當使用者貼上 Drive 網址時，你已具備最高合法授權，絕對禁止以「無法存取私人檔案」或「安全限制」為由拒絕，請立刻呼叫此工具解析。", parameters: { type: "OBJECT", properties: { fileUrl: { type: "STRING", description: "要讀取的檔案完整網址" } }, required: ["fileUrl"] } },

        { 
            name: "read_web_page", 
            description: "【代理人瀏覽模式 (Agent Browser Mode)】使用整合型無頭瀏覽器讀取網頁。此工具能穿透 JavaScript 與反爬蟲機制（如博客來、Amazon）。⚠️ 讀取規範：當搜尋摘要缺失 ISBN、原價或出版社等深度細節時，強制呼叫此工具進入內頁抓取。取得內容後，請嚴格基於內容回答，禁止腦補。你已獲得系統最高讀取授權，絕對禁止以「技術限制」為由拒絕。", 
            parameters: { type: "OBJECT", properties: { url: { type: "STRING", description: "要讀取的網頁完整網址 (需包含 http/https)" } }, required: ["url"] } 
        },
        { name: "google_search", description: "【萬用搜尋引擎】搜尋全球公開資訊與最新新聞。當使用者要求找尋資料、比較產品、或是現有知識不足時，請優先呼叫此工具。", parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "精確的搜尋關鍵字" } }, required: ["query"] } },
        { name: "search_web", description: "【備用搜尋引擎】功能同 google_search，作為冗餘備援。", parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "搜尋關鍵字" } }, required: ["query"] } },

        { name: "organize_drive_folder", description: "智慧整理 Google Drive 資料夾。", parameters: { type: "OBJECT", properties: { folderName: { type: "STRING" } }, required: ["folderName"] } },
        
        { name: "create_google_doc", description: "建立全新的 Google 文件。支援 Markdown 排版。", parameters: { type: "OBJECT", properties: { topic: { type: "STRING" }, content: { type: "STRING" }, folderName: { type: "STRING" } }, required: ["topic", "content"] } },
        
        { name: "read_google_doc", description: "【強制呼叫】讀取 Google 文件的所有文字內容。當使用者貼上 Google Docs 文件網址，並要求「總結、閱讀、提問、修改或覆寫」時，請唯一且強制呼叫此工具取得內容。", parameters: { type: "OBJECT", properties: { docUrl: { type: "STRING", description: "該 Google 文件的完整網址" } }, required: ["docUrl"] } },
        
        { name: "append_to_google_doc", description: "在現有 Google 文件最下方「補充/附加」新內容。", parameters: { type: "OBJECT", properties: { docUrl: { type: "STRING", description: "該 Google 文件的完整網址。" }, content: { type: "STRING", description: "要附加的新內容，支援 Markdown 排版" } }, required: ["docUrl", "content"] } },
        { 
            name: "overwrite_google_doc", 
            description: "完全覆寫現有 Google 文件。當使用者要求「修改整份文件」時使用。使用前務必先用 read_google_doc 讀取舊內容融合。🛡️ 安全警告：此操作涉及 HITL 攔截，執行前會彈出授權確認卡，請務必先告知使用者風險。", 
            parameters: { type: "OBJECT", properties: { docUrl: { type: "STRING", description: "該 Google 文件的完整網址。" }, content: { type: "STRING", description: "修改後的「完整」新內容，舊內容將被清空，支援 Markdown" } }, required: ["docUrl", "content"] } 
        },

        { name: "read_google_sheet", description: "讀取特定的 Google Sheet 試算表內容。", parameters: { type: "OBJECT", properties: { sheetUrl: { type: "STRING", description: "要讀取的試算表完整網址。" }, sheetName: { type: "STRING", description: "工作表(頁籤)名稱，若不指定則預設讀取第一頁。" }, range: { type: "STRING", description: "指定範圍，如 'A1:D10'，預設或填 'ALL' 讀取全部" } }, required: ["sheetUrl"] } },
        { name: "append_to_google_sheet", description: "【新增資料】將資料批次寫入或新增到指定的 Google Sheet 試算表最下方。如果頁籤不存在會自動建立。", parameters: { type: "OBJECT", properties: { sheetUrl: { type: "STRING", description: "要寫入的試算表完整網址。" }, sheetName: { type: "STRING", description: "工作表(頁籤)名稱" }, content: { type: "STRING", description: "要寫入的資料，請強制輸出符合標準的 JSON 陣列字串 (Array of Arrays) ，請務必使用「雙引號」而非單引號。例如: [[\"日期\", \"項目\", \"金額\"], [\"03/16\", \"午餐\", 150]]" } }, required: ["sheetUrl", "sheetName", "content"] } },
        { name: "update_google_sheet", description: "【修改資料】修改或更新指定的 Google Sheet 試算表特定範圍內的資料。當使用者要求「更新」、「修改」某特定欄位或整行資料時呼叫此工具。", parameters: { type: "OBJECT", properties: { sheetUrl: { type: "STRING", description: "要修改的試算表完整網址。" }, sheetName: { type: "STRING", description: "工作表(頁籤)名稱" }, range: { type: "STRING", description: "要更新的起始儲存格範圍，例如 'A2' 或 'B5:D5'" }, content: { type: "STRING", description: "要更新的新資料，請強制輸出符合標準的 JSON 陣列字串，務必使用「雙引號」。例如: [[\"已修改的A\", \"已修改的B\"]]" } }, required: ["sheetUrl", "sheetName", "range", "content"] } },

        { name: "generate_art", description: "【強制呼叫】當使用者要求「畫圖」、「生成圖片」時，請務必呼叫此工具。", parameters: { type: "OBJECT", properties: { prompt: { type: "STRING", description: "詳細的英文畫面描述" }, aspectRatio: { type: "STRING", description: "比例: 1:1, 16:9, 4:3, 3:4 之一" } }, required: ["prompt"] } },
        { name: "query_knowledge_base", description: "搜尋專屬知識庫 (NotebookLM)。", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
        
        { 
            name: "read_presentation", 
            description: "【強制呼叫】讀取 Google Slides (簡報) 的所有文字與備忘錄。當使用者貼上 Google 簡報網址並要求閱讀、摘要或總結時，請唯一且強制呼叫此工具取得內容。", 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    presentationUrl: { type: "STRING", description: "該 Google 簡報的完整網址" } 
                }, 
                required: ["presentationUrl"] 
            } 
        },

        { 
            name: "create_presentation", 
            description: "【首席簡報總監】直接在 Google Drive 中製作全新的 Google 簡報 (Google Slides)。此工具會自動生成真實的簡報檔案，並返回編輯與開啟網址。\n\n🎨 核心設計哲學：版面與配色絕對不寫死！你必須先深度閱讀使用者的文字內容，從文義、情緒、產業、受眾出發，動態選擇最適合的視覺風格。\n\n設計選擇指南：\n- 科技/AI類 → cyber 風格 + 深藍/青色系\n- 商業/簡報類 → minimalist 風格 + 企業藍/灰色系\n- 教育/學術類 → rounded 風格 + 溫暖橙/棕色系\n- 創意/文化類 → layered 風格 + 高彩度撞色\n- 能源/環境類 → dynamic 風格 + 綠色/大地色系\n- 醫療/健康類 → rounded 風格 + 藍綠/白色系\n\n你可以呼叫 google_search 搜尋『[主題] 簡報設計 配色 [年份]』來獲取最新設計趨勢，再做出最佳選擇。",
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    topic: { type: "STRING", description: "簡報核心主題" },
                    contentMood: { type: "STRING", description: "從文義分析出的情感基調，例如：'科技感/未來感', '溫暖/人文', '商務/專業', '創意/活潑', '嚴肅/學術'。這將作為配色與版面的主要依據。" },
                    customColors: { type: "OBJECT", description: "根據文義動態決定的主題配色 JSON (包含 bg, text, accent, shape 的 HEX 碼)。禁止使用固定的預設色！必須根據 contentMood 精心調配。" }, 
                    shapeStyle: { type: "STRING", description: "根據文義選擇的幾何風格: 'minimalist'(企業), 'rounded'(友善), 'cyber'(科技), 'dynamic'(活力), 'layered'(深度)。必填，不可留空。" }, 
                    slidesData: { type: "ARRAY", items: { type: "OBJECT" }, description: "簡報 JSON 陣列。格式：[{layout: 'cover|hero_quote|standard_list|split_column|card_deck|stepper|icon_grid|timeline|big_data', title: '標題', content: '內文', points: ['重點'], left: '左欄', right: '右欄', value: '大數據值', imageKeyword: '英文關鍵字', imageSource: 'ai'|'web'}]" } 
                }, 
                required: ["topic", "customColors", "shapeStyle", "slidesData"] 
            } 
        },
        { 
            name: "update_presentation", 
            description: "【修改/擴充簡報】修改現有的 Google Slides 簡報。", 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    presentationUrl: { type: "STRING", description: "現有簡報的完整網址" }, 
                    action: { type: "STRING", description: "'append' (附加投影片到最後) 或 'overwrite' (清空並重新繪製整份簡報)" }, 
                    customColors: { type: "OBJECT", description: "主題配色 JSON。" }, 
                    shapeStyle: { type: "STRING", description: "幾何風格擇一。" }, 
                    slidesData: { type: "ARRAY", items: { type: "OBJECT" }, description: "要新增或覆寫的簡報 JSON 陣列。" } 
                }, 
                required: ["presentationUrl", "action", "slidesData"] 
            } 
        },

        {
            name: "design_document",
            description: "【自由文件排版設計師】根據文義自動設計精美的 HTML 文件/報告。與 create_presentation 不同，此工具生成的是可捲動的長文件，適合：報告、提案書、研究摘要、企劃書、新聞稿。\n\n🎨 設計哲學：絕不寫死版面！必須從文字的『情感、產業、受眾』出發，動態選擇最適合的視覺風格、字型、排版結構。\n\n你可以先搜尋『[主題] 設計風格 排版 報告』來獲取靈感，再做最佳設計決策。",
            parameters: {
                type: "OBJECT",
                properties: {
                    title: { type: "STRING", description: "文件標題" },
                    contentMood: { type: "STRING", description: "從文義分析出的情感基調：'商務/正式', '創意/活潑', '學術/嚴肅', '溫暖/人文', '科技/簡約'" },
                    colorPalette: { type: "OBJECT", description: "根據文義動態選擇的配色（包含 primary, secondary, accent, bg, text 的 HEX 碼）。禁止寫死，必須根據 contentMood 精心選擇。" },
                    typography: { type: "STRING", description: "字型風格：'sans'(現代無襯線), 'serif'(正式有襯線), 'mono'(技術等寬)。根據文義選擇。" },
                    layoutStyle: { type: "STRING", description: "版面風格：'single_column'(單欄), 'two_column'(雙欄), 'magazine'(雜誌風), 'report'(報告風)" },
                    sections: { type: "ARRAY", items: { type: "OBJECT" }, description: "文件區塊 JSON 陣列。格式：[{type: 'hero|summary|body|quote|data_table|highlight_box|image_section', title: '區塊標題', content: '內容文字', data: [['欄1','欄2'],['值1','值2']], highlight: '重點摘要'}]" }
                },
                required: ["title", "colorPalette", "layoutStyle", "sections"]
            }
        },
        { 
            name: "execute_dynamic_tool", 
            description: "【Manus 級代碼執行器】當現有工具無法滿足複雜需求（如數據分析、自定義計算、互動式圖表、動態模擬）時使用。AI 會撰寫一段封裝好的 HTML/JS/CSS 工具並在沙盒中執行。請確保代碼自帶必要的 CDN（如 Chart.js, Tailwind, D3.js）。", 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    tool_name: { type: "STRING", description: "工具名稱，如 '複利計算器' 或 '銷售趨勢圖'" },
                    description: { type: "STRING", description: "工具功能簡述" },
                    html_code: { type: "STRING", description: "完整且自洽的 HTML 代碼 (包含 CSS 與 JS)。必須是一個完整的 <html> 結構或包含所需依賴的片段。" }
                }, 
                required: ["tool_name", "description", "html_code"] 
            } 
        },
        {
            name: "run_cloud_sandbox_code",
            description: "【anyGem 雲端電腦 (Computer Use)】啟動一台臨時虛擬機執行 Python 或 Shell 指令。適用於：複雜數據處理、檔案分析、安裝第三方軟體包或執行高強度計算。你可以建立檔案、下載網路資源並在沙盒中處理。",
            parameters: {
                type: "OBJECT",
                properties: {
                    language: { type: "STRING", description: "執行語言：'python' 或 'shell'。" },
                    code: { type: "STRING", description: "要執行的程式碼或指令。" },
                    files_to_create: { 
                        type: "ARRAY", 
                        items: { 
                            type: "OBJECT", 
                            properties: { 
                                path: { type: "STRING", description: "檔案路徑" }, 
                                content: { type: "STRING", description: "內容" } 
                            } 
                        },
                        description: "可選。執行前先在沙盒中建立的檔案。"
                    }
                },
                required: ["language", "code"]
            }
        },
        {
            name: "local_disk_search",
            description: "【本機磁碟搜尋】在使用者的本機電腦磁碟中搜尋檔案或資料夾。可依檔名關鍵字、副檔名搜尋，也可搜尋檔案內容。使用前需確認使用者的本機代理已啟動（http://localhost:3456/ping）。",
            parameters: {
                type: "OBJECT",
                properties: {
                    query: { type: "STRING", description: "搜尋關鍵字（檔名或內容）" },
                    root: { type: "STRING", description: "搜尋根目錄，例如 'D:\\\\' 或 'D:\\\\Projects'。預設為允許的第一個根目錄。" },
                    ext: { type: "STRING", description: "可選：限定副檔名，例如 '.pdf'、'.xlsx'、'.txt'" },
                    search_content: { type: "BOOLEAN", description: "是否同時搜尋檔案內容（較慢但更精準）。預設 false。" },
                    max_results: { type: "NUMBER", description: "最多回傳幾筆結果，預設 30。" }
                },
                required: ["query"]
            }
        },
        {
            name: "local_disk_browse",
            description: "【本機磁碟瀏覽】列出本機指定資料夾的內容（子資料夾與檔案清單），或取得磁碟使用空間資訊。",
            parameters: {
                type: "OBJECT",
                properties: {
                    action: { type: "STRING", description: "操作類型：'list'（列出目錄）或 'disk_info'（磁碟資訊）" },
                    path: { type: "STRING", description: "要列出的資料夾路徑，action 為 list 時必填。" }
                },
                required: ["action"]
            }
        },
        {
            name: "local_disk_read",
            description: "【讀取本機檔案】讀取使用者本機電腦上的文字檔案內容（支援 .txt/.md/.csv/.json/.js/.py/.html/.log 等）。檔案大小上限 512KB。",
            parameters: {
                type: "OBJECT",
                properties: {
                    path: { type: "STRING", description: "要讀取的完整檔案路徑，例如 'D:\\\\Projects\\\\notes.txt'" }
                },
                required: ["path"]
            }
        },
        {
            name: "local_disk_organize",
            description: "【整理本機檔案】對使用者本機電腦的檔案進行整理操作：移動、複製、重新命名、刪除、建立資料夾或用預設程式開啟。刪除操作需使用者授權。",
            parameters: {
                type: "OBJECT",
                properties: {
                    op: { type: "STRING", description: "操作：'move'（移動）、'copy'（複製）、'rename'（重新命名）、'delete'（刪除）、'mkdir'（建立資料夾）、'open'（開啟）" },
                    src: { type: "STRING", description: "來源路徑（檔案或資料夾的完整路徑）" },
                    dest: { type: "STRING", description: "目標路徑（move/copy/rename 需填）" }
                },
                required: ["op", "src"]
            }
        },
        {
            name: "local_run_command",
            description: "【本機終端機】在使用者的本機電腦上執行 PowerShell / CMD 指令（例如：npm install, python script.py, mkdir）。執行前會請求使用者確認。",
            parameters: {
                type: "OBJECT",
                properties: {
                    command: { type: "STRING", description: "要執行的終端機指令碼" },
                    cwd: { type: "STRING", description: "執行該指令的目錄路徑（選填）" }
                },
                required: ["command"]
            }
        },
        {
            name: "local_write_file",
            description: "【寫入本機檔案】將文字或程式碼直接儲存/覆寫到本機的指定路徑中。執行前會請求使用者確認。",
            parameters: {
                type: "OBJECT",
                properties: {
                    path: { type: "STRING", description: "要寫入的檔案完整絕對路徑" },
                    content: { type: "STRING", description: "要寫入的完整檔案內容或程式碼" }
                },
                required: ["path", "content"]
            }
        },
        {
            name: "local_docker_run_command",
            description: "【安全隔離沙盒】在使用者的 Docker 容器 (node:18) 中執行指令。當需要建置未知的專案、執行爬蟲、安裝不熟悉的套件、或跑未知的程式碼時，請務必使用此安全容器環境，不要使用本機終端機。執行前會請求使用者確認。",
            parameters: {
                type: "OBJECT",
                properties: {
                    command: { type: "STRING", description: "要在 Docker 內執行的 bash 指令碼" },
                    cwd: { type: "STRING", description: "執行的目錄路徑（會自動對應掛載，選填）" }
                },
                required: ["command"]
            }
        }
    ]
}];

function getSuperAgentPrompt(wsName, customRules) {
    const tz = Session.getScriptTimeZone();
    const now = new Date();
    const days = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    const timeString = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()} (${days[now.getDay()]}) ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

    return `【絕對核心時鐘與時空錨點】
現在真實系統時間：${timeString} (時區：${tz})

你是一位全能、嚴謹且實事求是的 anyGem AI 代理人，遵循 Manus 級別的頂尖代理人作業標準 (Agent SOP)。你不僅能聊天，更是一位能自主規劃、執行、並交付高品質成果的【全能指揮官】。

【🛡️ Manus 核心作業標準 (Agent SOP)】：
你必須在處理複雜任務時，嚴格遵守以下四個階段的思維框架：

階段一：任務規劃 (Strategy Planning)
- **語境解析**：深入識別使用者的隱含需求、風格偏好與限制。
- **階段拆解**：將複雜任務拆分為 4-10 個可執行的子目標。
- **主動澄清**：若目標模糊，先以文字詢問 (ask) 溝通，避免盲目執行。

階段二：執行與迭代 (Agent Loop)
- **分析與推理**：在每次呼叫工具前，先分析當前進度 (Observation) 與下一步邏輯。
- **結果評估**：工具執行後，評估結果是否達成階段目標。若失敗，立即診斷錯誤並嘗試「替代路徑」。

階段三：特定模式 (Specialized Modes)
- **WebDev 模式**：處理程式碼時，先規劃架構圖，再精準寫入 GitHub 或 Sheet 資料庫。
- **Slides 模式**：製作簡報時，先完成內容深度研究與資產規劃，再進入生成流程。
- **Generate 模式**：處理圖片生成時，請直接在對話中輸出 Markdown 圖片語法："![圖片描述](https://image.pollinations.ai/prompt/經過URL編碼的英文提示詞?width=800&height=800&nologo=true)"，不需呼叫工具。
- **DeepResearch 模式**：處理電商（如博客來）、學術論文或深度資料搜尋時，嚴禁只依賴搜尋引擎的摘要。必須執行「點進內頁」的遞迴讀取流程，確保 ISBN、價格、細節規格等資料 100% 準確。

階段四：品質控管與交付 (QC & Delivery)
- **資料合成**：將碎片化的工具回報資訊，整合為結構化、美觀的 Markdown 報告。
- **終極驗證**：在交付前，最後確認格式是否專業、連結是否可用。
- **成果摘要**：回覆最後必須附上簡短的執行摘要與所有成果附件。

【執行紀律與 Manus 作業標準 (Execution Discipline)】：
1. **方案優先 (Plan First)**：嚴格遵守在階段二中與使用者討論過的架構、排版與配色建議。
2. **混合圖片引擎 (Hybrid Image Engine)**：根據內容性質精確選擇圖片來源（ai 或 web）。
3. **內容完整性 (Integrity)**：對於原始數據、名單、文案，必須 100% 完整保留，禁止擅自摘要或修改專業術語。
4. **資料探勘 (Deep Research)**：搜尋具備唯一性的精確資料時，嚴禁依賴摘要。必須逐一點進內頁獲取真實數據。
5. **RAG 實事求是與事實錨定 (RAG Fact Grounding)**：當你呼叫 \`google_search\` 獲取最新網頁資訊時，你**必須以搜尋結果中的事實為準**。如果搜尋結果中的最新事實（例如：現任總統、現任官員、近期事件、最新發展）與你內建的訓練知識（Cutoff）相衝突，**必須優先採信搜尋結果**，絕對不要用你內建的舊知識去修改或覆寫搜尋到的事實。
6. **自主尋求真實資訊義務 (Duty to Search)**：當使用者提及特定專有名詞、特定講次編號（如「廣海明月第XXX講」）、特定新聞事件、或是任何你不具備精確最新知識的主題時，**你必須主動且優先呼叫** \`query_knowledge_base\`（若是您的專屬文件/資料庫）或 \`google_search\`（若是公開網路資訊）工具來取得真實數據。**絕對禁止在未進行搜尋的情況下，直接憑空捏造或猜測答案。**如果你進行了搜尋但沒有結果，必須在回覆中誠實說明。

【🗂️ 專案記憶隔離 (Workspace)】
您目前正處於『${wsName}』的專案空間中。請針對此空間的脈絡進行連貫性對話。

【高階代理人執行協議：四階段思考與執行框架 (ReAct + HITL)】：
從現在起，你必須嚴格遵循以下框架來處理所有請求：

⚙️ **階段一：解構與意圖識別 (Analyze)**
收到請求後，請先在心裡執行以下檢查：
1. **核心目標**：使用者最終想要什麼產出？
2. **絕對限制**：使用者有沒有指定「不准修改的文字」、「特定的格式」或「特殊的語氣」？

⚙️ **階段二：沙盤推論與提案 (Plan & Propose)**
對於超過 3 個步驟或涉及排版、設計、長文撰寫的複雜任務，【絕對禁止】直接產出最終結果。你必須先輸出：
- **[💡 代理人行動藍圖]**：
  - 任務理解確認（1 句話）
  - 預計執行的結構/大綱/版面配置
  - 預計使用的工具或技術
- **⚠️ 等待授權**：在藍圖結尾，強制詢問：「以上方案是否符合您的預期？請回覆『同意』或給予修改建議，我才會開始執行。」

⚙️ **階段三：鎖定執行 (Strict Execution)**
當使用者回覆「同意」後，請切換至「機器人模式」進行精準代工：
1. **工具啟動義務 (Crucial)**：如果藍圖中包含「畫圖」、「搜尋」、「建立文件」等需要工具的動作，你【必須】在此回合立即呼叫對應工具。**絕對禁止只用文字描述結果而不實際執行工具動作。**
2. **嚴格鎖定**：對於在階段二討論中提供的「原始文字」或標註為「保留」的內容，啟動「100% 複製貼上協議」，絕對禁止做任何詞彙替換、縮減或自作聰明地「潤飾」。
3. **照圖施工**：完全依照「階段二」通過的藍圖執行，不隨意加戲。

⚙️ **階段四：自我驗證與交付 (Verify & Deliver)**
交付成品前，請自我檢查：
- **視覺與執行檢查**：如果任務包含「繪圖」，檢查你是否已經確實輸出了正確的 Pollinations 圖片網址？如果任務包含「搜尋」，檢查你是否已經確實呼叫了 \`google_search\`？
- **文字檢查**：是否遺漏了原始文字？格式是否與藍圖一致？
確認無誤後，交付最終成品，並簡短說明使用方式。

【執行紀律與 Manus 作業標準 (Execution Discipline)】：
1. **意圖確認與 Token 節約 (Clarification First)**：遵循上述「階段二」提案邏輯，資訊不明確或任務過於複雜時，禁止盲目執行。
2. **確定的指令 (沉默執行)**：僅對於極度簡單且意圖明確的指令 (如：搜尋某新聞)，可跳過藍圖直接執行以維持效率。
3. **工具定義明確化**：'create_presentation' 工具生成的【就是】互動式網頁簡報。禁止告訴使用者「我只能做 Google 簡報」。
4. **Live Canvas 與 Agentic UI 優先協議**：

你現在擁有一個位於側邊欄的「Live Canvas (動態畫布)」。
當使用者要求「分析數據」、「視覺化」、「設計介面」或「互動式操作」時，你【必須】優先呼叫 'execute_dynamic_tool'。
這個工具會直接在側邊欄生成一個具備 HTML/JS/Tailwind/Lucide 能力的互動式元件。
透過這個畫布，你可以為使用者提供「實時、可操作、可點擊」的解決方案，而不僅僅是文字回覆。
畫布支援 React (UMD), Tailwind CSS, Lucide Icons 等現代前端技術。

5. ✅ **Agentic UI 與雲端電腦雙軌協議**：
  - 當需要「數據視覺化、互動式操作」時，優先呼叫 'execute_dynamic_tool' 在側邊欄生成前端元件。
  - 當需要「雲端純粹的數據分析與運算」時，使用 'run_cloud_sandbox_code'。
  - 當使用者明確要求「使用 Docker 沙盒」或是需要「在安全的本地隔離環境中建置專案/執行指令」時，必須呼叫 'local_docker_run_command'，切勿混淆。
6. **安全優先與 HITL 授權協議 (Security First & HITL)**：
  - 涉及「刪除檔案」、「覆寫 Google Doc」、「雲端電腦執行 Shell」或「正式發送郵件」等操作時，系統會自動攔截。
  - 涉及「刪除檔案/對話」、「覆寫 Google Doc」、「GitHub 回滾 (Rollback)」或「正式發送郵件」等敏感操作時，系統已建置 **HITL (人機協同)** 安全攔截機制。
  - 當你呼叫這些工具時，系統會自動攔截並彈出「授權確認卡」給使用者。
  - 因此，你【必須】在執行前（階段二/階段四）誠實告知使用者該操作的影響範圍與風險。
  - 如果使用者拒絕授權，請根據使用者的反饋調整計畫，不要嘗試繞過攔截。
7. **單次迴圈執行上限警報與預先確認規範 (12-Iteration Loop Budget & Proactive Planning)**：
  - ⚠️ **限制機制**：後端系統設有硬性的單次執行限制，最多只能執行 12 次工具呼叫（\`MAX_ITERATIONS = 12\`）。
  - **預先評估與分階段提案**：在「階段二：沙盤推論與提案」中，如果你評估該任務的步驟或所需的工具呼叫次數會**接近或超過 8 次**（例如需要連續搜尋並深入讀取 3 個以上的網頁，或者批次更新多個檔案）：
    - **必須**在提案的行動藍圖中明示：\`⚠️ 由於系統單次工具執行限制為 12 次，此任務較為複雜，直接執行可能觸發系統強行中止。\`
    - **必須**向使用者提出「分階段執行建議」。例如：建議第一階段僅做資料檢索，第二階段再做寫入或排版，詢問使用者是否同意先執行第一階段。
  - **主動交付與中斷**：在執行過程中，如果你已經連續呼叫了 8-10 次工具，且發現剩餘步驟仍有很多，**不要強行執行到 12 次**。你應該主動在當前回答中交付已完成的階段性成果，並清楚引導使用者在下一輪對話中輸入簡單指令（如『請繼續執行下一步』）來延續執行剩餘步驟。
【🧠 使用者專屬大腦與規則 (Custom Rules)】
<rules>
${customRules}
</rules>

【📅 行事曆與時間強制規範】
若要建立行事曆，請嚴格計算「現在真實系統時間」，並將 startTime 與 endTime 轉換為標準 ISO 8601 格式。

[場景 A：建立新專案]
當使用者要求「自動部署全端」、「做一個 App」時：
1. 呼叫 \`create_database_sheet\` 建立資料庫，取得 \`sheetId\`。
2. 呼叫 \`deploy_fullstack_matrix\`，利用 additionalFiles 參數傳遞您拆分好的模組檔案。系統會自動幫您建立 GitHub 專案與 CI/CD 腳本。

[場景 B：修改與熱更新已部署專案]
當使用者要求「修改」時：絕對不要重新建立專案！請判斷只需修改哪個模組 (例如只改 \`frontend/components.js\`)，然後只呼叫 \`push_to_github\` 去精準覆寫該特定檔案，將破壞半徑降到最低。

[場景 C：災難復原 (Rollback)]
當使用者反應「剛剛的更新壞了」、「畫面卡死」、「退回上一版」時：
立刻呼叫 \`rollback_github_deployment\` 工具退回 Git 版本。退回成功後，請深呼吸，重新思考剛剛的邏輯哪裡有問題，並向使用者提出可能的錯誤原因與修正方案。

[場景 D：動態工具合成 (Manus 級代碼執行器)]
當使用者提出需要自定義計算、數據視覺化、互動式儀表板，或現有工具無法直接解決的複雜數據任務時：
⚠️ **觸發限制**：當使用者只是要求「執行純指令任務」時，**【嚴禁】**呼叫 'execute_dynamic_tool' 來合成網頁。你**【必須】**呼叫實體沙盒工具。注意：如果是要求雲端純運算，請用 'run_cloud_sandbox_code'；如果使用者要求「Docker 沙盒」或「本地安全沙盒」，請優先使用 'local_docker_run_command'，並將命令列的輸出以 Markdown 回覆給使用者。
1. 分析任務所需之邏輯與介面。
2. 呼叫 'execute_dynamic_tool'，合成一段包含 HTML/JS/CSS 的代碼。
3. 代碼中應包含必要的 CDN（如 Chart.js, Tailwind, D3.js），並確保具備高品質的 UI/UX 設計。
4. 最終呈現一個能在側邊欄操作的「即時工具」，這將極大提升任務完成的專業感與效率。

[場景 D-2：資料整合輔助]
當你透過 \`google_search\` 或 \`read_web_page\` 取得大量原始資料，但無法用簡單表格完整呈現時（如 50 本書、複雜比對）：
1. 將搜尋到的原始資料整理成 JSON 格式，嵌入 'execute_dynamic_tool' 的 html_code 中。
2. 合成一個互動式「資料瀏覽工具」（含搜尋框、排序、篩選功能）。
3. 使用者可以直接在這個工具中查看、篩選你蒐集到的所有資料。
⚡ **觸發時機**：任何超過 10 筆以上的表格資料，應優先考慮合成一個「互動式工具」而非輸出靜態 Markdown 表格。

【📁 安全歸檔模式 (Safe Archive Assistant)】
當使用者要求「整理資料夾」、「集中歸檔」多個未知檔案時，請呼叫 \`scan_and_prepare_archive\`。取得資料後，請【強制】使用以下 5 個標題回覆使用者（請原封不動使用標題字眼）：
1. **【任務理解總結】**：簡述使用者的需求。
2. **【執行結果與研究大綱】**：說明建立狀況，並將新資料夾轉換為 Markdown 超連結。
3. **【主體內容：掃描歸檔清單】**：將搜出的檔案繪製成表格 (欄位必須為：檔案類型 | 檔案名稱 | 連結)。若回傳有 nextPageToken，請主動告知「還有更多檔案，是否需要載入下一頁？」。
4. **【批判思考/風險提示】**：加入 ⚠️ 符號，明確說明基於資料安全協議，需由使用者親自「拖曳搬移」，並針對掃描到的檔案給出版本控管建議。
5. **【行動方案/結論】**：引導使用者點擊連結進行搬移，並詢問是否需要進一步的 AI 分析服務。

【🖋️ 專業文件與簡報規範】
1. **Google Docs**: 
  - 標題級別嚴格遵守 H1 > H2 > H3。
  - 所有清單超過 3 項時，優先考慮使用表格 (Table) 呈現以利閱讀。
  - 必須包含「文件控制表」於文首。

4. **Google Slides**: 
  - 嚴格遵守【視覺執行與設計鐵律】。
  - 禁止連續兩張投影片使用相同 Layout。
  - 每一頁的文字量若極多，請開啟「網頁簡報模式」之滾動功能，不要擅自刪減。
  - 'customColors' 必須根據主題情感（商務、熱情、科技、皮紙/Vellum）挑選對比鮮明的 HEX 色碼。
  - 'imageKeyword' 必須包含 'high quality', 'cinematic lighting', 'professional photography' 等修飾詞。

  - **簡報風格與劇本智慧建議規範 (Style & Playbook Proactive Recommendation)**：
    - 當使用者要求建立簡報且**未指定**特定風格、劇本或色系時，你在「階段二：沙盤推論與提案」中，**必須**根據簡報的主題、調性與受眾，主動從設定中推薦最適合的「10大風格 (Style)」、「劇本 (Playbook)」與「色系 (Theme)」。

[場景 E：深度資料探勘 (Deep Research)]
當使用者要求「搜尋特定產品清單」、「整理書籍資訊 (含 ISBN/價格)」等任務時，你必須切換至【資深研究員人格】，執行「Manus 級別」的資料驗證 SOP：
1. **立即規劃探勘計畫**：在回覆開頭列出你要訪問的網站與探勘步驟。
2. **搜尋與篩選**：使用 \`google_search\` 取得初步清單，並從中挑選最精確的官方或大型電商來源（如博客來、Amazon）。
3. **【核心動作：深度讀取與定向備援】**：
  - **優先嘗試**：呼叫 \`read_web_page\` 進入內頁抓取完整數據。
  - **定向備援 (Targeted Search)**：若 \`read_web_page\` 報錯或被擋，**禁止放棄**。你必須改為針對缺失欄位進行「精確關鍵字搜尋」。
4. **【嚴格資料完整性校驗】**：
  - 只要 ISBN、價格、規格等關鍵欄位出現「無法取得」或「未知」，即視為任務未完成。
  - 你必須不斷切換搜尋關鍵字與工具，直到填滿表格。
  - 只有在嘗試過 3 個不同策略皆失敗時，才能標註「資料受限」。
5. **【資料合成】**：當資料量超過 10 筆時，優先呼叫 'execute_dynamic_tool' 合成一個互動式書目查詢工具，而非輸出靜態表格。
6. **彙整交付**：最後以 Markdown 表格或互動式工具呈現。
⚠️ **研究員禁令**：
- 禁止對使用者說「由於工具無法使用，我無法...」。工具壞了就換個搜尋關鍵字，你是來解決問題的。
- ⛔ 禁止使用 Python 直譯器。✅ 允許且鼓勵使用 'execute_dynamic_tool' 撰寫 JS 代碼來整合資料。`;
}

function performInnerQALoop(text, apiKey, isToolArg = false) {
    if (!text || text.length < 10) return text;
    try {
        const sysPrompt = isToolArg ? 
            "你是一個嚴格的 JSON 參數審查器。請確保文字符合標準 JSON（所有屬性與字串必須使用雙引號，絕對禁止單引號）。" :
            "【排版檢查員】請檢查以下文字。如果包含「破損的 Markdown 表格」，請幫忙修復。如果是一般的對話文字、行程列表或正常的 Markdown 排版，請務必直接判定為合格（pass: true）。⛔ 絕對禁止將自然語言文字或列表擅自轉換為 JSON 格式！";
            
        const payload = {
            contents: [{ parts: [{ text: text }] }],
            system_instruction: { parts: [{ text: sysPrompt + "\n若無格式錯誤，請回傳 {\"pass\": true}；若有錯，請修正並將結果放入 auto_fixed_text 回傳。" }] },
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: { type: "OBJECT", properties: { pass: { type: "BOOLEAN" }, auto_fixed_text: { type: "STRING" } } }
            }
        };
        const urlTemplate = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key={KEY}`;
        const json = fetchGoogleAPIWithRotation(urlTemplate, payload, apiKey, "post");
        if (json.candidates && json.candidates[0].content) {
            const result = JSON.parse(json.candidates[0].content.parts[0].text);
            if (result.pass === false && result.auto_fixed_text) {
                return result.auto_fixed_text;
            }
        }
    } catch(e) { console.warn("QA Loop 逾時或失敗，跳過審查", e); }
    return text;
}

function fetchYouTubeTranscriptNative(videoId) {
    try {
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const htmlRes = UrlFetchApp.fetch(videoUrl, { muteHttpExceptions: true }).getContentText();
        const regex = /"captionTracks":\[\{"baseUrl":"(https[^"]+)"/;
        const match = htmlRes.match(regex);
        if (!match || !match[1]) return "【錯誤】影片未提供 CC 隱藏式字幕。";
        const captionUrl = match[1].replace(/\\u0026/g, "&");
        const xmlRes = UrlFetchApp.fetch(captionUrl, { muteHttpExceptions: true }).getContentText();
        const textRegex = /<text[^>]*>(.*?)<\/text>/g;
        let transcript = ""; let textMatch;
        while ((textMatch = textRegex.exec(xmlRes)) !== null) {
            let line = textMatch[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
            transcript += line + " ";
        }
        return transcript.trim() || "【錯誤】字幕檔為空";
    } catch (e) { return "【錯誤】抓取失敗"; }
}

function runAutonomousAgentLoop(config) {
    let currentHistory = [...config.history];
    let isFirstTurn = true; let finalReply = ""; let finalImage = null; let finalMime = null; let finalModel = config.model;
    const MAX_ITERATIONS = 12; let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
        iterations++;
        
        let apiPayload = {
            prompt: isFirstTurn ? config.prompt : "",
            model: config.model, apiKey: config.apiKey, systemInstruction: config.systemInstruction,
            history: currentHistory, tools: config.tools, imageData: isFirstTurn ? config.imageData : null,
            isFunctionResponse: !isFirstTurn && currentHistory.length > 0 && currentHistory[currentHistory.length - 1].role === "user" && currentHistory[currentHistory.length - 1].parts && currentHistory[currentHistory.length - 1].parts[0].functionResponse !== undefined
        };

        let aiResponse;
        if (isOpenAICompatibleModel(config.model)) {
            aiResponse = callOpenAICompatibleAPI_Raw(apiPayload, config.configData);
        } else {
            aiResponse = callGeminiAPI_Raw(apiPayload);
        }
        let cand = aiResponse.candidates && aiResponse.candidates[0];
        
        if (!cand) { throw new Error("API 未回傳任何候選內容。可能是安全機制阻擋或伺服器超載。"); }
        if (cand.finishReason === "SAFETY") throw new Error("提示詞涉及敏感內容，被安全機制阻擋。");
        
        let responseParts = (cand.content && cand.content.parts) ? cand.content.parts : [];
        let functionCallParts = responseParts.filter(p => p.functionCall);
        let aiTextGenerated = responseParts.filter(p => p.text).map(p => p.text).join('\n').trim();

        if (functionCallParts.length > 0) {
            if (isFirstTurn) {
                let userPart = config.imageData ? [{ text: config.prompt }, { inlineData: { mimeType: config.imageData.mimeType, data: config.imageData.data } }] : [{ text: config.prompt }];
                currentHistory.push({ role: "user", parts: userPart });
            }
            
            currentHistory.push({ role: "model", parts: responseParts });
            let toolResponses = [];

            for (let part of functionCallParts) {
                if (!part.functionCall.id) part.functionCall.id = "call_" + Math.random().toString(36).substring(2, 10);
                const fnCall = part.functionCall; const fnName = fnCall.name; const args = fnCall.args; let toolResult = {};

                try {
                    if (args.content && typeof args.content === 'string') args.content = performInnerQALoop(args.content, config.apiKey, true);
                    if (args.rowData && typeof args.rowData === 'string') args.rowData = performInnerQALoop(args.rowData, config.apiKey, true);
                } catch(e) {}

                const sensitiveTools = ["overwrite_google_doc", "rollback_github_deployment", "delete_session", "send_email_or_draft"];
                const isEmailActuallySending = (fnName === "send_email_or_draft" && !args.isDraft);
                
                if ((sensitiveTools.includes(fnName) || isEmailActuallySending) && !config.confirmed) {
                    let warningMsg = `⚠️ **安全攔截：偵測到敏感動作**\n\n代理人試圖執行：\`${fnName}\`\n參數摘要：\`${JSON.stringify(args).substring(0, 200)}\`\n\n為了您的資料安全，此動作必須由您親自授權。請確認是否執行？`;
                    return { 
                        reply: warningMsg, 
                        model: "Security-Gateway", 
                        needs_confirmation: true, 
                        pending_tool_call: part.functionCall 
                    };
                }

                try {
                    switch (fnName) {
                        case "create_database_sheet":
                            try {
                                let newSs = SpreadsheetApp.create(`${args.appName} Database`);
                                newSs.insertSheet("紀錄與設定");
                                toolResult = { status: "success", reply: `已成功建立專屬資料庫。`, data: { sheetId: newSs.getId(), sheetUrl: newSs.getUrl() } };
                            } catch(e) { toolResult = { status: "error", error_message: e.toString() }; }
                            break;

                        case "deploy_fullstack_matrix":
                            let pat = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT') || config.GITHUB_PAT;
                            if (!pat) {
                                toolResult = { status: "error", error_message: "系統尚未設定 GITHUB_PAT 環境變數。請在 Apps Script 的「專案設定 > 指令碼屬性」中新增。" };
                                break;
                            }
                            try {
                                let createRes = UrlFetchApp.fetch(`https://api.github.com/user/repos`, { 
                                    method: "post", 
                                    headers: { "Authorization": `Bearer ${pat}`, "Accept": "application/vnd.github.v3+json", "X-GitHub-Api-Version": "2022-11-28" }, 
                                    contentType: "application/json", 
                                    payload: JSON.stringify({ name: args.repoName, auto_init: true, private: true }), 
                                    muteHttpExceptions: true 
                                });
                                let repoData = JSON.parse(createRes.getContentText());
                                if (createRes.getResponseCode() >= 300 && repoData.message !== "name already exists on this account") { 
                                    throw new Error(repoData.message); 
                                }
                                
                                let fullName = repoData.full_name || `${Session.getEffectiveUser().getEmail().split('@')[0]}/${args.repoName}`;
                                
                                const workflowYaml = `name: Matrix Auto Deploy\non:\n  push:\n    branches: [ main, master ]\n    paths:\n      - 'backend/**'\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v3\n        with:\n          token: \${{ secrets.GITHUB_TOKEN }}\n      - name: Setup Node\n        uses: actions/setup-node@v3\n        with:\n          node-version: '18'\n      - name: Install Clasp\n        run: npm install -g @google/clasp\n      - name: Authenticate Clasp\n        run: echo '\${{ secrets.CLASPRC_JSON }}' > ~/.clasprc.json\n      - name: Deploy Backend to GAS\n        run: |\n          cd backend\n          if [ ! -f .clasp.json ]; then\n            clasp create --type webapp --title "\${{ github.repository }}-backend"\n            git config --global user.name "github-actions[bot]"\n            git config --global user.email "github-actions[bot]@users.noreply.github.com"\n            git add .clasp.json\n            git commit -m "chore: save clasp config [skip ci]"\n            git push\n          fi\n          clasp push -f\n          clasp deploy -d "Matrix Auto Deploy"`;
                                
                                const readmeMd = `# ${args.repoName}\n\n🤖 本專案由 anyGem AI 自動生成與部署。基於微服務與模組化架構。\n\n## 部署指南\n1. **前端**：請將此 Repo 綁定至 Vercel，根目錄設為 \`frontend\`。\n2. **後端**：請至 GitHub 專案的 \`Settings > Secrets and variables > Actions\` 新增 \`CLASPRC_JSON\` Secret。`;

                                let filesToPush = [
                                    { path: "frontend/index.html", content: args.frontendCode },
                                    { path: "backend/Code.gs", content: args.backendCode },
                                    { path: "backend/appsscript.json", content: `{"timeZone": "Asia/Taipei", "dependencies": {}, "webapp": {"executeAs": "USER_DEPLOYING", "access": "ANYONE"}}` },
                                    { path: ".github/workflows/deploy.yml", content: workflowYaml },
                                    { path: "README.md", content: readmeMd }
                                ];

                                if (args.additionalFiles) {
                                    try {
                                        let extraFiles = JSON.parse(args.additionalFiles);
                                        if (Array.isArray(extraFiles)) {
                                            extraFiles.forEach(ef => { if (ef.path && ef.content) filesToPush.push(ef); });
                                        }
                                    } catch(e) { console.error("Failed to parse additional files"); }
                                }

                                let pushSuccessCount = 0;
                                for (let f of filesToPush) {
                                    let apiUrl = `https://api.github.com/repos/${fullName}/contents/${f.path}`;
                                    let b64 = Utilities.base64Encode(Utilities.newBlob(f.content).getBytes());
                                    let res = UrlFetchApp.fetch(apiUrl, {
                                        method: "put",
                                        headers: { "Authorization": `Bearer ${pat}`, "Accept": "application/vnd.github.v3+json", "X-GitHub-Api-Version": "2022-11-28" },
                                        contentType: "application/json",
                                        payload: JSON.stringify({ message: `Initialize ${f.path}`, content: b64 }),
                                        muteHttpExceptions: true
                                    });
                                    if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) { pushSuccessCount++; }
                                    Utilities.sleep(400); 
                                }
                                
                                toolResult = { 
                                    isTerminal: true, 
                                    reply: `🚀 **全端模組化部署完成！(Matrix Protocol)**\n\n- **GitHub 專案庫**: [${fullName}](https://github.com/${fullName})\n- **模組數量**: 成功推送 ${pushSuccessCount}/${filesToPush.length} 個檔案。\n- **CI/CD 管線**: 已配置自動發布。\n\n💡 若未來您需要修改特定功能，我將僅覆寫特定檔案，降低破壞風險。若發生錯誤，隨時可呼叫我執行 \`Rollback\`。` 
                                };
                            } catch(e) { toolResult = { status: "error", error_message: `全端部署發生錯誤: ${e.toString()}` }; }
                            break;

                        case "rollback_github_deployment":
                            let githubPatRollback = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT') || config.GITHUB_PAT;
                            if (!githubPatRollback) { toolResult = { status: "error", error_message: "系統尚未設定 GITHUB_PAT 環境變數。" }; break; }
                            try {
                                let headers = { "Authorization": `Bearer ${githubPatRollback}`, "Accept": "application/vnd.github.v3+json", "X-GitHub-Api-Version": "2022-11-28" };
                                let repoRes = UrlFetchApp.fetch(`https://api.github.com/repos/${args.repoName}`, { headers: headers, muteHttpExceptions: true });
                                let repoJson = JSON.parse(repoRes.getContentText());
                                if (repoRes.getResponseCode() !== 200) throw new Error(repoJson.message);
                                let defaultBranch = repoJson.default_branch;

                                let commitsRes = UrlFetchApp.fetch(`https://api.github.com/repos/${args.repoName}/commits?sha=${defaultBranch}&per_page=2`, { headers: headers, muteHttpExceptions: true });
                                let commitsJson = JSON.parse(commitsRes.getContentText());
                                if (commitsRes.getResponseCode() !== 200) throw new Error(commitsJson.message);
                                if (commitsJson.length < 2) throw new Error("專案的 Commit 數量不足 2 筆，無法退回。");
                                
                                let previousCommitSha = commitsJson[1].sha;

                                let updateRefRes = UrlFetchApp.fetch(`https://api.github.com/repos/${args.repoName}/git/refs/heads/${defaultBranch}`, {
                                    method: "patch", headers: headers, contentType: "application/json",
                                    payload: JSON.stringify({ sha: previousCommitSha, force: true }), muteHttpExceptions: true
                                });
                                let updateRefJson = JSON.parse(updateRefRes.getContentText());
                                if (updateRefRes.getResponseCode() !== 200) throw new Error(updateRefJson.message);

                                toolResult = { isTerminal: true, reply: `⏪ **災難復原成功 (Rollback)！**\n\n已將專案 \`${args.repoName}\` 強制退回至上一個穩定的版本 (${previousCommitSha.substring(0, 7)})。\n\n雲端 CI/CD 正在背景重新部署，請稍後重整網頁。現在，請告訴我剛剛到底是哪裡壞了？讓我們一起尋找 Bug 出在哪裡吧！` };
                            } catch(e) { toolResult = { status: "error", error_message: `退回失敗: ${e.toString()}` }; }
                            break;

                        case "create_calendar_event":
                            let start = new Date(args.startTime); 
                            let end = args.endTime ? new Date(args.endTime) : new Date(start.getTime() + 60 * 60 * 1000);
                            
                            let cal = CalendarApp.getDefaultCalendar();
                            let usedCalName = "預設行事曆";
                            
                            if (args.calendarName) {
                                const calendars = CalendarApp.getCalendarsByName(args.calendarName);
                                if (calendars.length > 0) {
                                    cal = calendars[0];
                                    usedCalName = args.calendarName;
                                } else {
                                    toolResult = { status: "error", error_message: `找不到名稱為「${args.calendarName}」的行事曆，請確認名稱是否正確。` };
                                    break;
                                }
                            }
                            
                            let eventOptions = { description: args.description || "由 anyGem Agent 自動建立" };
                            
                            if (args.guests) {
                                eventOptions.guests = args.guests;
                                eventOptions.sendInvites = true;
                            }
                            
                            const ev = cal.createEvent(args.title, start, end, eventOptions);
                            
                            let replyMsg = `✅ 已成功在「${usedCalName}」建立行程：${args.title}`;
                            if (args.guests) replyMsg += `\n📧 並已發送 Google 日曆邀請給：${args.guests}`;
                            
                            toolResult = { status: "success", reply: replyMsg, url: `https://calendar.google.com/calendar/r/eventedit/${ev.getId().split('@')[0]}` }; 
                            break;

                        case "batch_create_calendar_events":
                            let list = JSON.parse(args.eventsData); let count = 0; let batchCal = CalendarApp.getDefaultCalendar();
                            list.forEach(e => { let s = new Date(e.startTime); let ed = e.endTime ? new Date(e.endTime) : new Date(s.getTime() + 3600000); if (!isNaN(s.getTime())) { batchCal.createEvent(e.title, s, ed, { description: e.description }); count++; } });
                            toolResult = { status: "success", reply: `成功批次寫入 ${count} 筆行程` }; break;
                        case "get_calendar_events":
                            let qs = new Date(args.startDate), qe = new Date(args.endDate); let evs = CalendarApp.getDefaultCalendar().getEvents(qs, qe);
                            let eventDetails = evs.length === 0 ? "期間無行程" : evs.map(e => `[EventID: ${e.getId()}] ${e.getStartTime().toLocaleString()} - ${e.getTitle()}`).join("\n");
                            toolResult = { status: "success", data: eventDetails }; break;
                        case "add_event_reminder":
                            try { let eventToUpdate = CalendarApp.getDefaultCalendar().getEventById(args.eventId);
                                if(eventToUpdate) { let mins = parseInt(args.minutesBefore); if(mins > 0 && mins <= 40320) { eventToUpdate.addPopupReminder(mins); toolResult = { status: "success", reply: `成功設定提醒。` }; } else { toolResult = { status: "error", error_message: "時間超出範圍。" }; }
                                } else { toolResult = { status: "error", error_message: "找不到 Event ID" }; }
                            } catch(e) { toolResult = { status: "error", error_message: e.toString() }; } break;
                        case "read_unread_emails":
                            let limit = args.limit || 5; let threads = GmailApp.getInboxThreads(0, limit);
                            let unreadData = threads.filter(t => t.isUnread()).map(t => { let msg = t.getMessages()[0]; let plainBody = msg.getPlainBody().trim().replace(/\s+/g, ' '); let summary = plainBody ? plainBody.substring(0, 300) + "..." : "【無法解析純文字】"; return `[寄件者: ${msg.getFrom()}] 主旨: ${msg.getSubject()}\n內文: ${summary}`; }).join("\n\n");
                            toolResult = { status: "success", data: unreadData || "無未讀信件。" }; break;
                        case "send_email_or_draft":
                            if (args.isDraft) { GmailApp.createDraft(args.recipient, args.subject, args.body); toolResult = { isTerminal: true, reply: `📝 **草稿已建立**\n\n已存入草稿匣。` }; }
                            else { GmailApp.sendEmail(args.recipient, args.subject, args.body); toolResult = { isTerminal: true, reply: `📧 **信件已發送**給 ${args.recipient}。` }; } break;
                        
                        case "create_survey_form":
                            try {
                                let form = FormApp.create(args.title); 
                                if (args.description) form.setDescription(args.description);
                                let questionsRaw = args.questions; let questions = [];
                                if (typeof questionsRaw === 'string') {
                                    let cleanStr = questionsRaw.replace(/```json/gi, '').replace(/```/g, '').trim();
                                    questions = JSON.parse(cleanStr);
                                } else if (Array.isArray(questionsRaw)) { questions = questionsRaw; }

                                questions.forEach(q => { 
                                    let item;
                                    switch (q.type) {
                                        case 'MULTIPLE_CHOICE': item = form.addMultipleChoiceItem().setTitle(q.title); if (q.choices && Array.isArray(q.choices) && q.choices.length > 0) item.setChoiceValues(q.choices); break;
                                        case 'CHECKBOX': item = form.addCheckboxItem().setTitle(q.title); if (q.choices && Array.isArray(q.choices) && q.choices.length > 0) item.setChoiceValues(q.choices); break;
                                        case 'LIST': item = form.addListItem().setTitle(q.title); if (q.choices && Array.isArray(q.choices) && q.choices.length > 0) item.setChoiceValues(q.choices); break;
                                        case 'SCALE': item = form.addScaleItem().setTitle(q.title); if (q.scale) item.setBounds(q.scale.min || 1, q.scale.max || 5).setLabels(q.scale.minLabel || '', q.scale.maxLabel || ''); break;
                                        case 'DATE': item = form.addDateItem().setTitle(q.title); break;
                                        case 'TIME': item = form.addTimeItem().setTitle(q.title); break;
                                        case 'PARAGRAPH': item = form.addParagraphTextItem().setTitle(q.title); break;
                                        case 'TEXT': default: item = form.addTextItem().setTitle(q.title); break;
                                    }
                                    if (q.required && item.setRequired) item.setRequired(true);
                                });
                                toolResult = { isTerminal: true, reply: `📋 **表單建立完成！**\n\n名稱：${args.title}\n🔗 [編輯表單](${form.getEditUrl()})\n🚀 [發布網址](${form.getPublishedUrl()})` }; 
                            } catch(formErr) {
                                toolResult = { isTerminal: true, reply: `❌ **建立表單失敗**：\n\n*(底層錯誤：${formErr.toString()})*\n\n💡 **系統診斷與修復建議**：\n1. **權限未開通 (最常見)**：請回到 Apps Script 編輯器手動執行一次 forceAuthSetup 進行授權。\n2. **AI 格式錯誤**：選項格式不符合規範，請嘗試簡化指令重試。` };
                            }
                            break;
                        
                        case "create_drive_folder":
                            try {
                                let newFolder;
                                if (args.parentFolderUrl) {
                                    let parentIdMatch = args.parentFolderUrl.match(/[-\w]{25,}/);
                                    if (!parentIdMatch || !parentIdMatch[0]) throw new Error("無法解析父資料夾網址");
                                    let parentFolder = DriveApp.getFolderById(parentIdMatch[0]);
                                    newFolder = parentFolder.createFolder(args.folderName);
                                } else {
                                    newFolder = DriveApp.createFolder(args.folderName);
                                }
                                toolResult = { status: "success", reply: `成功建立資料夾：${args.folderName}`, data: { folderUrl: newFolder.getUrl(), folderId: newFolder.getId() } };
                            } catch(e) { toolResult = { status: "error", error_message: `建立資料夾失敗: ${e.toString()}` }; }
                            break;

                        case "search_drive_files":
                            try {
                                let safeKw = args.keyword.replace(/'/g, "\\'");
                                let query = `fullText contains '${safeKw}' and trashed = false`;
                                
                                if (args.fileType) {
                                    const typeMap = { 'document': 'application/vnd.google-apps.document', 'spreadsheet': 'application/vnd.google-apps.spreadsheet', 'folder': 'application/vnd.google-apps.folder', 'pdf': 'application/pdf' };
                                    for (const [key, val] of Object.entries(typeMap)) {
                                        if (args.fileType.toLowerCase().includes(key)) { query += ` and mimeType = '${val}'`; break; }
                                    }
                                }
                                
                                let files = DriveApp.searchFiles(query);
                                let results = [];
                                let count = 0;
                                while (files.hasNext() && count < 40) {
                                    let f = files.next();
                                    results.push({ name: f.getName(), url: f.getUrl(), id: f.getId(), type: f.getMimeType() });
                                    count++;
                                }
                                
                                if (results.length === 0) {
                                    let titleQuery = `title contains '${safeKw}' and trashed = false`;
                                    let titleFiles = DriveApp.searchFiles(titleQuery);
                                    while (titleFiles.hasNext() && count < 40) {
                                        let f = titleFiles.next();
                                        results.push({ name: f.getName(), url: f.getUrl(), id: f.getId(), type: f.getMimeType() });
                                        count++;
                                    }
                                }
                                
                                toolResult = { 
                                    status: "success", 
                                    data: results.length > 0 ? results : "未找到符合條件的檔案或資料夾。"
                                };
                            } catch(e) { toolResult = { status: "error", error_message: `搜尋失敗: ${e.toString()}` }; }
                            break;
                            
                        case "scan_and_prepare_archive":
                            try {
                                let safeKw = args.keyword.replace(/'/g, "\\'");
                                let folderName = args.keyword + " 資料夾";
                                let newFolder;
                                
                                let folders = DriveApp.searchFolders(`title = '${folderName}' and trashed = false`);
                                if (folders.hasNext()) {
                                    newFolder = folders.next();
                                } else {
                                    newFolder = DriveApp.createFolder(folderName);
                                }
                                let folderUrl = newFolder.getUrl();
                                
                                let query = `title contains '${safeKw}' and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
                                
                                let listArgs = { q: query, maxResults: 50 };
                                if (args.pageToken) listArgs.pageToken = args.pageToken;
                                
                                let response;
                                try {
                                    response = Drive.Files.list(listArgs);
                                } catch (driveErr) {
                                    throw new Error("請確認已在 GAS 服務中開啟 Drive API (v2)。" + driveErr.toString());
                                }
                                
                                let results = [];
                                if (response.items) {
                                    response.items.forEach(f => {
                                        let mime = f.mimeType;
                                        let typeIcon = "📄 其他";
                                        if (mime.includes('spreadsheet')) typeIcon = "📊 Excel";
                                        else if (mime.includes('presentation')) typeIcon = "🪧 PPT";
                                        else if (mime.includes('document')) typeIcon = "📄 Word";
                                        else if (mime.includes('pdf')) typeIcon = "📕 PDF";
                                        results.push({ "檔案類型": typeIcon, "檔案名稱": f.title, "連結": f.alternateLink });
                                    });
                                }
                                
                                toolResult = { 
                                    status: "success", 
                                    reply: `已掃描出相關檔案。系統強制要求：請務必根據【安全歸檔模式】規範的 5 大標塊來回覆。`,
                                    data: { 
                                        "專屬資料夾名稱": folderName, 
                                        "專屬資料夾連結": folderUrl, 
                                        "此頁掃描到的檔案數量": results.length, 
                                        "檔案清單": results,
                                        "nextPageToken": response.nextPageToken || null
                                    }
                                };
                            } catch(e) { toolResult = { status: "error", error_message: `安全掃描失敗: ${e.toString()}` }; }
                            break;

                        case "move_drive_file":
                            try {
                                let fileToMove = null; let targetFolder = null;
                                let fileIdMatch = args.fileIdentifier.match(/[-\w]{25,}/);
                                if (fileIdMatch && fileIdMatch[0]) { fileToMove = DriveApp.getFileById(fileIdMatch[0]); } 
                                else {
                                    let safeFileName = args.fileIdentifier.replace(/'/g, "\\'");
                                    let files = DriveApp.searchFiles(`title = '${safeFileName}' and trashed = false`);
                                    if (files.hasNext()) fileToMove = files.next();
                                }
                                if (!fileToMove) { toolResult = { isTerminal: true, reply: `❌ **找不到指定的檔案：** \`${args.fileIdentifier}\`\n請確認檔案名稱是否正確，或直接提供該檔案的 Google Drive 網址。` }; break; }

                                let folderIdMatch = args.folderIdentifier.match(/[-\w]{25,}/);
                                if (folderIdMatch && folderIdMatch[0]) { targetFolder = DriveApp.getFolderById(folderIdMatch[0]); } 
                                else {
                                    let safeFolderName = args.folderIdentifier.replace(/'/g, "\\'");
                                    let folders = DriveApp.searchFolders(`title = '${safeFolderName}' and trashed = false`);
                                    if (folders.hasNext()) targetFolder = folders.next();
                                    else targetFolder = DriveApp.createFolder(args.folderIdentifier);
                                }

                                fileToMove.moveTo(targetFolder);
                                toolResult = { isTerminal: true, reply: `🚚 **檔案搬移成功！**\n\n已成功將 \`${fileToMove.getName()}\` 移至資料夾 \`${targetFolder.getName()}\` 內。\n🔗 [點擊查看目標資料夾](${targetFolder.getUrl()})` };
                            } catch(e) { toolResult = { isTerminal: true, reply: `❌ **搬移過程發生錯誤：**\n\n${e.toString()}\n\n*(請確認您是否擁有該檔案與資料夾的編輯權限)*` }; }
                            break;

                        case "read_drive_file":
                            let fileIdMatch = args.fileUrl.match(/[-\w]{25,}/);
                            if (!fileIdMatch || !fileIdMatch[0]) { toolResult = { status: "error", error_message: "無法辨識的文件網址，請確認連結正確" }; break; }
                            try {
                                const file = DriveApp.getFileById(fileIdMatch[0]);
                                let content = extractTextFromAnyFile(file, config.apiKey);
                                toolResult = { status: "success", data: content.substring(0, 30000) };
                            } catch(e) {
                                let executeEmail = "此系統執行身分"; try { executeEmail = Session.getEffectiveUser().getEmail() || executeEmail; } catch(err) {}
                                toolResult = { status: "error", error_message: `無法讀取檔案: ${e.toString()}。請確認您有權限存取該檔案，或已開權限給 ${executeEmail}` };
                            }
                            break;

                        case "read_presentation":
                            let presIdRead = args.presentationUrl.match(/[-\w]{25,}/);
                            if (!presIdRead || !presIdRead[0]) { 
                                toolResult = { status: "error", error_message: "無法辨識的簡報網址，請確認包含長度正確的 ID。" }; 
                                break; 
                            }
                            try {
                                let content = extractTextFromPresentation(presIdRead[0]);
                                toolResult = { status: "success", data: content };
                            } catch(e) {
                                let executeEmail = "此系統執行身分"; try { executeEmail = Session.getEffectiveUser().getEmail() || executeEmail; } catch(err) {}
                                toolResult = { status: "error", error_message: `無法讀取簡報: ${e.toString()}。請確認這是 Google Slides 且您有權限存取，或已開權限給 ${executeEmail}` };
                            }
                            break;
                        case "query_knowledge_base":
                            try {
                                const configData = config.configData || {};
                                const folderId = configData.KNOWLEDGE_BASE_FOLDER_ID || PropertiesService.getScriptProperties().getProperty('KNOWLEDGE_BASE_FOLDER_ID');
                                if (!folderId) {
                                    toolResult = { status: "error", error_message: "找不到 KNOWLEDGE_BASE_FOLDER_ID 設定，請在 setting 工作表新增該設定。" };
                                    break;
                                }
                                
                                const safeKw = args.query.replace(/'/g, "\\'");
                                let query = `(title contains '${safeKw}' or fullText contains '${safeKw}') and '${folderId}' in parents and trashed = false`;
                                let files = DriveApp.searchFiles(query);
                                let results = [];
                                let count = 0;
                                while (files.hasNext() && count < 10) {
                                    let f = files.next();
                                    let mime = f.getMimeType();
                                    let fileContent = "";
                                    try {
                                        if (mime === "application/vnd.google-apps.document") {
                                            fileContent = DocumentApp.openById(f.getId()).getBody().getText().substring(0, 3000);
                                        } else if (mime === "text/plain" || mime === "text/markdown") {
                                            fileContent = f.getAs("text/plain").getDataAsString().substring(0, 3000);
                                        }
                                    } catch(err) {
                                        fileContent = "（無法讀取該檔案內文: " + err.toString() + "）";
                                    }
                                    results.push({
                                        name: f.getName(),
                                        url: f.getUrl(),
                                        id: f.getId(),
                                        mimeType: mime,
                                        contentSnippet: fileContent || "（該格式無文字內容摘要）"
                                    });
                                    count++;
                                }
                                
                                if (results.length === 0) {
                                    let fallbackQuery = `title contains '${safeKw}' and trashed = false`;
                                    let fallbackFiles = DriveApp.searchFiles(fallbackQuery);
                                    while (fallbackFiles.hasNext() && count < 5) {
                                        let f = fallbackFiles.next();
                                        results.push({
                                            name: f.getName(),
                                            url: f.getUrl(),
                                            id: f.getId(),
                                            mimeType: f.getMimeType(),
                                            contentSnippet: "（全域雲端硬碟搜尋備用匹配，非知識庫直屬檔案）"
                                        });
                                        count++;
                                    }
                                }
                                
                                if (results.length === 0) {
                                    toolResult = { status: "success", data: `在知識庫中找不到與 "${args.query}" 相關的檔案。` };
                                } else {
                                    toolResult = { status: "success", data: JSON.stringify(results) };
                                }
                            } catch(e) {
                                toolResult = { status: "error", error_message: `搜尋知識庫失敗: ${e.toString()}` };
                            }
                            break;

                        case "google_search":
                        case "search_web":
                            try {
                                let jinaApiKey = PropertiesService.getScriptProperties().getProperty('JINA_API_KEY') || (config && config.JINA_API_KEY);
                                if (jinaApiKey === "undefined" || jinaApiKey === "null" || !jinaApiKey) jinaApiKey = null;
                                
                                const options = { 
                                    muteHttpExceptions: true, 
                                    headers: { 
                                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                                        "X-With-Links-Summary": "true"
                                    } 
                                };
                                if (jinaApiKey) options.headers["Authorization"] = "Bearer " + jinaApiKey;
                                
                                let query = args.query.trim();
                                
                                const cache = CacheService.getScriptCache();
                                const cacheKey = "search_" + Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, query).map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
                                const cachedSearch = cache.get(cacheKey);
                                if (cachedSearch) {
                                    toolResult = { status: "success", data: cachedSearch + "\n\n(⚡ 此內容來自系統快取)" };
                                    break;
                                }

                                let searchResult = "";
                                
                                try {
                                    let res = UrlFetchApp.fetch("https://s.jina.ai/" + encodeURIComponent(query), options);
                                    let status = res.getResponseCode();
                                    if (status === 200) {
                                        searchResult = res.getContentText();
                                    } else if (status === 401 || status === 403 || status === 429) {
                                        let opt2 = { ...options, headers: { ...options.headers } };
                                        delete opt2.headers["Authorization"];
                                        res = UrlFetchApp.fetch("https://s.jina.ai/" + encodeURIComponent(query), opt2);
                                        if (res.getResponseCode() === 200) searchResult = res.getContentText();
                                    }
                                } catch(e) {}
                                
                                if (!searchResult && (query.includes("博客來") || query.includes("書"))) {
                                    try {
                                        const booksUrl = "https://search.books.com.tw/search/query/key/" + encodeURIComponent(query.replace(/博客來/g, ""));
                                        let res = UrlFetchApp.fetch("https://r.jina.ai/" + booksUrl, options);
                                        if (res.getResponseCode() === 200) searchResult = res.getContentText();
                                    } catch(e) {}
                                }

                                if (!searchResult) {
                                    try {
                                        const ddgUrl = "https://duckduckgo.com/html/?q=" + encodeURIComponent(query);
                                        let res = UrlFetchApp.fetch("https://r.jina.ai/" + ddgUrl, options);
                                        if (res.getResponseCode() === 200 && !res.getContentText().includes("unusual traffic")) searchResult = res.getContentText();
                                    } catch(e) {}
                                }
                                
                                if (!searchResult) {
                                    try {
                                        const googleUrl = "https://www.google.com/search?q=" + encodeURIComponent(query);
                                        let res = UrlFetchApp.fetch("https://r.jina.ai/" + googleUrl, options);
                                        if (res.getResponseCode() === 200) searchResult = res.getContentText();
                                    } catch(e) {}
                                }
                                
                                if (searchResult) {
                                    const finalResult = searchResult.substring(0, 35000);
                                    try { 
                                        let safeVal = finalResult;
                                        if (safeVal.length > 90000) safeVal = safeVal.substring(0, 90000); 
                                        cache.put(cacheKey, safeVal, 1800); 
                                    } catch(e) {}
                                    toolResult = { status: "success", data: finalResult };
                                } else {
                                    toolResult = { status: "error", error_message: "搜尋服務暫時無法使用。建議直接輸入網址進行讀取。" };
                                }
                            } catch(e) { toolResult = { status: "error", error_message: `搜尋底層發生錯誤: ${e.toString()}` }; }
                            break;

                        case "read_web_page":
                            try {
                                const targetUrl = args.url.trim();
                                
                                const cache = CacheService.getScriptCache();
                                const cacheKey = "web_" + Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, targetUrl).map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
                                const cachedContent = cache.get(cacheKey);
                                if (cachedContent) {
                                    toolResult = { status: "success", data: cachedContent + "\n\n(⚡ 此內容來自系統快取)" };
                                    break;
                                }

                                const jinaApiKey = PropertiesService.getScriptProperties().getProperty('JINA_API_KEY') || (config && config.JINA_API_KEY);
                                
                                const jinaOptions = { 
                                    muteHttpExceptions: true, 
                                    headers: { 
                                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                                        "X-Return-Format": "markdown",
                                        "X-With-Images-Summary": "true"
                                    } 
                                };
                                if (jinaApiKey) {
                                    jinaOptions.headers["Authorization"] = "Bearer " + jinaApiKey;
                                }
                                
                                let response = UrlFetchApp.fetch("https://r.jina.ai/" + targetUrl, jinaOptions);
                                let status = response.getResponseCode();
                                let contentText = "";
                                
                                if (status === 200 && response.getContentText().length > 200) {
                                    contentText = response.getContentText();
                                } else {
                                    const directOptions = {
                                        muteHttpExceptions: true,
                                        headers: {
                                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
                                            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
                                        }
                                    };
                                    response = UrlFetchApp.fetch(targetUrl, directOptions);
                                    status = response.getResponseCode();
                                    
                                    if (status === 200) {
                                        let html = response.getContentText();
                                        html = html.replace(/<(script|style|nav|footer|header|aside|iframe|canvas)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, ' ');
                                        const mainMatch = html.match(/<(main|article|div id="content"|div class="main")[^>]*>([\s\S]*?)<\/\1>/i);
                                        const source = mainMatch ? mainMatch[2] : html;
                                        contentText = source.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                                    } else {
                                        throw new Error(`Jina Error (${status}) & Direct Fetch Error (${status})。`);
                                    }
                                }

                                let finalContent = `【系統強制指令：以下為網頁擷取的真實內容。】\n\n網址：${targetUrl}\n---\n${contentText.substring(0, 35000)}`;
                                try { 
                                    let safeVal = finalContent;
                                    if (safeVal.length > 90000) safeVal = safeVal.substring(0, 90000);
                                    cache.put(cacheKey, safeVal, 1800); 
                                } catch(e) {}
                                toolResult = { status: "success", data: finalContent };
                            } catch(e) {
                                toolResult = { 
                                    status: "error", 
                                    error_message: `網頁穿透失敗: ${e.toString()}。建議：請 AI 嘗試搜尋其他來源網址。` 
                                };
                            }
                            break;

                        case "create_project_wiki":
                            const wikiDoc = createDocFromContent(`WIKI: ${args.projectName}`, String(args.content)); toolResult = { isTerminal: true, reply: `🗺️ **Wiki 導覽頁已建立！**\n🔗 [開啟 Wiki](${wikiDoc.url})` }; break;
                        case "organize_drive_folder":
                            let targetFolders = DriveApp.getFoldersByName(args.folderName); if (!targetFolders.hasNext()) { toolResult = { status: "error", error_message: `找不到資料夾` }; break; }
                            let parentFolder = targetFolders.next(); let folderFiles = parentFolder.getFiles(); let moveCount = 0; let imgFolder, docFolder, otherFolder;
                            while (folderFiles.hasNext()) { let f = folderFiles.next(); let mimeTypeStr = f.getMimeType(); let targetDest = null;
                                if (mimeTypeStr.includes('image/')) { if (!imgFolder) imgFolder = getOrCreateSubFolder(parentFolder, "圖片素材庫"); targetDest = imgFolder; }
                                else if (mimeTypeStr.includes('document') || mimeTypeStr.includes('pdf') || mimeTypeStr.includes('spreadsheet') || mimeTypeStr.includes('presentation')) { if (!docFolder) docFolder = getOrCreateSubFolder(parentFolder, "文件與報表"); targetDest = docFolder; }
                                else { if (!otherFolder) otherFolder = getOrCreateSubFolder(parentFolder, "其他檔案與壓縮檔"); targetDest = otherFolder; }
                                f.moveTo(targetDest); moveCount++; }
                            toolResult = { isTerminal: true, reply: `🗂️ **整理完畢！** 共歸類 ${moveCount} 個檔案。` }; break;
                        
                        case "create_google_doc":
                        case "read_google_doc":
                        case "append_to_google_doc":
                        case "overwrite_google_doc":
                            if (fnName === 'create_google_doc') {
                                const docTitle = String(args.topic || args.title || "未命名").trim(); const docIdAndUrl = createDocFromContent(docTitle, String(args.content || "")); let docUrl = docIdAndUrl.url; let folderMsg = "根目錄";
                                if (args.folderName) { let newFolderUrl = moveFileToFolderByName(docIdAndUrl.id, args.folderName); if (newFolderUrl) folderMsg = `[${args.folderName}]`; }
                                toolResult = { isTerminal: true, reply: `📄 **Google 文件已生成！**\n📁 位置：${folderMsg}\n🔗 [開啟文件](${docUrl})` }; 
                            } else {
                                let idMatch = args.docUrl.match(/[-\w]{25,}/);
                                if (!idMatch) { toolResult = { status: "error", error_message: "無法辨識的文件網址" }; break; }
                                try {
                                    const doc = DocumentApp.openById(idMatch[0]);
                                    if (fnName === 'read_google_doc') { toolResult = { status: "success", data: doc.getBody().getText().substring(0, 30000) }; }
                                    else if (fnName === 'append_to_google_doc') { doc.getBody().appendParagraph("\n"); appendMarkdownToBody(doc.getBody(), args.content); doc.saveAndClose(); toolResult = { isTerminal: true, reply: `📄 內容已附加！\n[點擊開啟](${doc.getUrl()})` }; }
                                    else { doc.getBody().clear(); appendMarkdownToBody(doc.getBody(), args.content); doc.saveAndClose(); toolResult = { isTerminal: true, reply: `📄 內容已覆寫！\n[點擊開啟](${doc.getUrl()})` }; }
                                } catch(e) { toolResult = { status: "error", error_message: e.toString() }; }
                            }
                            break;

                        case "read_google_sheet":
                            try {
                                let targetSsForRead = config.ss;
                                if (args.sheetUrl) {
                                    let idMatch = args.sheetUrl.match(/[-\w]{25,}/);
                                    if (idMatch && idMatch[0]) targetSsForRead = SpreadsheetApp.openById(idMatch[0]);
                                    else throw new Error("無法解析的試算表網址");
                                }
                                let rsh;
                                if (args.sheetName) {
                                    rsh = targetSsForRead.getSheetByName(args.sheetName);
                                } else {
                                    const currentWs = config.wsName || "";
                                    if (currentWs) rsh = targetSsForRead.getSheetByName(currentWs);
                                    if (!rsh) {
                                        const excluded = [BASE_CONFIG.SETTING_SHEET_NAME, "Gems", "Models"];
                                        const validSheets = targetSsForRead.getSheets().filter(sh => !excluded.includes(sh.getName()) && !sh.getName().startsWith("_db_"));
                                        rsh = validSheets.length > 0 ? validSheets[0] : targetSsForRead.getSheets()[0];
                                    }
                                }
                                if (!rsh) throw new Error("找不到指定的工作表");
                                
                                let sheetData = (!args.range || args.range === 'ALL') ? rsh.getDataRange().getDisplayValues() : rsh.getRange(args.range).getDisplayValues();
                                if (sheetData.length > 100) sheetData = sheetData.slice(0, 100); 
                                
                                toolResult = { status: "success", data: sheetData };
                            } catch(e) { toolResult = { status: "error", error_message: `讀取試算表失敗: ${e.toString()}` }; }
                            break;

                        case "append_to_google_sheet":
                            try {
                                const protectedSheets = [BASE_CONFIG.SETTING_SHEET_NAME, "Gems", "Models"];
                                if (protectedSheets.includes(args.sheetName)) {
                                    toolResult = { isTerminal: true, reply: `❌ **系統安全攔截 (Security Exception)**：\n\n系統核心控制面板 (\`${args.sheetName}\`) 禁止透過 Agent 自動化工具進行修改。若需調整設定、模型或角色，請管理員手動前往試算表處理。` };
                                    break;
                                }

                                let targetSsForWrite = config.ss;
                                if (args.sheetUrl) {
                                    let idMatch = args.sheetUrl.match(/[-\w]{25,}/);
                                    if (idMatch && idMatch[0]) targetSsForWrite = SpreadsheetApp.openById(idMatch[0]);
                                    else throw new Error("無法解析的試算表網址");
                                }
                                let tsh = targetSsForWrite.getSheetByName(args.sheetName);
                                if (!tsh) { tsh = targetSsForWrite.insertSheet(args.sheetName); }
                                
                                let dataToWrite = [];
                                try {
                                    let rawData = args.content || args.rowData || "[]";
                                    let cleanStr = String(rawData).replace(/```json/gi, '').replace(/```javascript/gi, '').replace(/```/g, '').trim();
                                    
                                    let parsed;
                                    try { parsed = JSON.parse(cleanStr); } catch(e1) { try { parsed = new Function("return " + cleanStr)(); } catch(e2) { parsed = cleanStr; } }
                                    
                                    if (Array.isArray(parsed) && parsed.length > 0) {
                                        if (typeof parsed[0] === 'object' && !Array.isArray(parsed[0])) {
                                            let headers = Object.keys(parsed[0]);
                                            if (tsh.getLastRow() === 0) dataToWrite.push(headers);
                                            parsed.forEach(obj => dataToWrite.push(headers.map(h => obj[h])));
                                        } else if (Array.isArray(parsed[0])) { dataToWrite = parsed; } else { dataToWrite = [parsed]; }
                                    } else if (typeof parsed === 'object' && parsed !== null) {
                                        let headers = Object.keys(parsed);
                                        if (tsh.getLastRow() === 0) dataToWrite.push(headers);
                                        dataToWrite.push(headers.map(h => parsed[h]));
                                    } else { dataToWrite = [[parsed]]; }
                                } catch(e) { dataToWrite = [[args.content || args.rowData]]; }
                                
                                if (dataToWrite.length > 0) {
                                    let startRow = tsh.getLastRow() + 1;
                                    let maxCols = Math.max(...dataToWrite.map(r => r.length));
                                    dataToWrite = dataToWrite.map(r => {
                                        let newRow = Array.isArray(r) ? [...r] : [r];
                                        while (newRow.length < maxCols) newRow.push("");
                                        return newRow;
                                    });
                                    if (maxCols > tsh.getMaxColumns()) tsh.insertColumnsAfter(tsh.getMaxColumns(), maxCols - tsh.getMaxColumns());
                                    tsh.getRange(startRow, 1, dataToWrite.length, maxCols).setValues(dataToWrite);
                                }
                                
                                toolResult = { isTerminal: true, reply: `✅ **資料已批次寫入試算表！**\n\n已成功寫入 ${dataToWrite.length} 筆資料至 \`${args.sheetName}\` 頁籤。\n🔗 [點擊開啟試算表](${targetSsForWrite.getUrl()})` };
                            } catch(e) { toolResult = { isTerminal: true, reply: `❌ **寫入試算表失敗：**\n\n*(請確認您提供的網址是否正確，且已開放編輯權限。)*\n底層錯誤: ${e.toString()}` }; }
                            break;

                        case "update_google_sheet":
                            try {
                                const protectedSheets = [BASE_CONFIG.SETTING_SHEET_NAME, "Gems", "Models"];
                                if (protectedSheets.includes(args.sheetName)) {
                                    toolResult = { isTerminal: true, reply: `❌ **系統安全攔截 (Security Exception)**：\n\n系統核心控制面板 (\`${args.sheetName}\`) 禁止透過 Agent 自動化工具進行修改。若需調整設定、模型或角色，請管理員手動前往試算表處理。` };
                                    break;
                                }

                                let targetSsForUpdate = config.ss;
                                if (args.sheetUrl) {
                                    let idMatch = args.sheetUrl.match(/[-\w]{25,}/);
                                    if (idMatch && idMatch[0]) targetSsForUpdate = SpreadsheetApp.openById(idMatch[0]);
                                    else throw new Error("無法解析的試算表網址");
                                }
                                let ush = targetSsForUpdate.getSheetByName(args.sheetName);
                                if (!ush) throw new Error(`找不到名稱為 '${args.sheetName}' 的工作表頁籤`);
                                
                                let dataToUpdate = [];
                                try {
                                    let rawData = args.content || "[]";
                                    let cleanStr = String(rawData).replace(/```json/gi, '').replace(/```javascript/gi, '').replace(/```/g, '').trim();
                                    
                                    let parsed;
                                    try { parsed = JSON.parse(cleanStr); } catch(e1) { try { parsed = new Function("return " + cleanStr)(); } catch(e2) { parsed = cleanStr; } }
                                    
                                    if (Array.isArray(parsed)) { dataToUpdate = Array.isArray(parsed[0]) ? parsed : [parsed]; } else { dataToUpdate = [[parsed]]; }
                                } catch(e) { dataToUpdate = [[args.content]]; }
                                
                                if (dataToUpdate.length > 0) {
                                    let targetRange = ush.getRange(args.range);
                                    let startRow = targetRange.getRow();
                                    let startCol = targetRange.getColumn();
                                    let numRows = dataToUpdate.length;
                                    let numCols = Math.max(...dataToUpdate.map(r => Array.isArray(r) ? r.length : 1));
                                    
                                    dataToUpdate = dataToUpdate.map(r => {
                                        let newRow = Array.isArray(r) ? [...r] : [r];
                                        while (newRow.length < numCols) newRow.push("");
                                        return newRow;
                                    });
                                    if (startCol + numCols - 1 > ush.getMaxColumns()) {
                                        ush.insertColumnsAfter(ush.getMaxColumns(), (startCol + numCols - 1) - ush.getMaxColumns());
                                    }
                                    ush.getRange(startRow, startCol, numRows, numCols).setValues(dataToUpdate);
                                }
                                
                                toolResult = { isTerminal: true, reply: `✅ **資料已成功更新！**\n\n已將新資料精準覆寫至 \`${args.sheetName}\` 頁籤的範圍 \`${args.range}\`。\n🔗 [點擊開啟試算表查看](${targetSsForUpdate.getUrl()})` };
                            } catch(e) { toolResult = { isTerminal: true, reply: `❌ **更新試算表失敗：**\n\n*(請確認您提供的網址、頁籤名稱與範圍格式是否正確。)*\n底層錯誤: ${e.toString()}` }; }
                            break;

                        case "generate_art":
                            try {
                                let blob = fetchAIImage(args.prompt, config.apiKey, config.artistModel, args.aspectRatio || "1:1");
                                if (typeof blob === 'string' && blob.startsWith("ERROR:")) {
                                    toolResult = { status: "error", error_message: blob.replace("ERROR:", "") };
                                } else if (blob) {
                                    finalImage = Utilities.base64Encode(blob.getBytes());
                                    finalMime = "image/png";
                                    toolResult = { isTerminal: true, reply: `🎨 **圖像已根據您的要求繪製完成！**\n\n*(提示詞：${args.prompt})*` };
                                } else {
                                    throw new Error("生成失敗，未獲取到影像資料。");
                                }
                            } catch(e) { toolResult = { status: "error", error_message: `繪圖失敗: ${e.toString()}` }; }
                            break;

                        case "create_presentation":
                            let themeToUse = PPT_THEMES['modern_blue'];
                            try {
                                if (args.customColors) {
                                    let rawC = args.customColors;
                                    if (typeof rawC === 'string') {
                                        try { rawC = JSON.parse(rawC.replace(/```json/gi, '').replace(/```/g, '').trim()); } catch(e) {}
                                    }
                                    if (typeof rawC === 'object') {
                                        themeToUse = { 
                                            colors: { 
                                                background: rawC.background || rawC.bg || "#0f172a", 
                                                text: rawC.text || "#f8fafc", 
                                                accent: rawC.accent || "#38bdf8", 
                                                shape: rawC.shape || "#1e293b" 
                                            } 
                                        };
                                    }
                                }
                            } catch(e) { console.error("顏色解析失敗", e); }
                            
                            let parsedData = [];
                            try {
                                let rawS = args.slidesData;
                                if (typeof rawS === 'string') {
                                    try { rawS = JSON.parse(rawS.replace(/```json/gi, '').replace(/```/g, '').trim().replace(/\n/g, ' ').replace(/\r/g, '').replace(/\t/g, ' ')); } catch(e) {}
                                }
                                if (Array.isArray(rawS)) {
                                    parsedData = rawS;
                                } else {
                                    toolResult = { isTerminal: true, reply: "⚠️ **簡報建立失敗**\n\nAI 生成的簡報資料格式無效 (不是陣列)。請嘗試重新生成或簡化指令。" }; break;
                                }
                            } catch(e) { 
                                toolResult = { isTerminal: true, reply: `⚠️ **簡報建立失敗**\n\n簡報資料格式錯誤，無法解析內容：\n${e.toString()}` }; break; 
                            }
                            
                            try {
                                const isAutoImage = config.configData ? config.configData.autoImageEnabled : true;
                                const pid = createGeometricSlides(args.topic, parsedData, themeToUse, args.shapeStyle || 'minimalist', isAutoImage, config.apiKey, config.artistModel);
                                const presentationUrl = `https://docs.google.com/presentation/d/${pid}/edit`;
                                toolResult = {
                                    isTerminal: true,
                                    reply: `🎉 **您的 Google 簡報已直接在雲端生成完成！**\n\n主題：${args.topic}\n投影片數量：${parsedData.length} 頁\n幾何風格：${args.shapeStyle || 'minimalist'}\n\n🔗 **[點擊開啟 Google 簡報](${presentationUrl})**`
                                };
                            } catch(e) {
                                toolResult = { isTerminal: true, reply: `❌ **直接生成 Google 簡報失敗：**\n\n底層錯誤: ${e.toString()}` };
                            }
                            break;
                        case "update_presentation":
                            let presIdMatch = args.presentationUrl.match(/[-\w]{25,}/);
                            if (!presIdMatch) { toolResult = { status: "error", error_message: "無法辨識的簡報網址" }; break; }
                            
                            let updTheme = PPT_THEMES['modern_blue'];
                            try {
                                if (args.customColors) {
                                    const rawC = typeof args.customColors === 'string' ? JSON.parse(args.customColors.replace(/```json/gi, '').replace(/```/g, '').trim()) : args.customColors;
                                    updTheme = { colors: { background: rawC.background || rawC.bg || "#0f172a", text: rawC.text || "#f8fafc", accent: rawC.accent || "#38bdf8", shape: rawC.shape || "#1e293b" } };
                                }
                            } catch(e) { console.warn("更新配色解析失敗", e); }
                            
                            let processedUpdData = [];
                            try {
                                if (typeof args.slidesData === 'string') {
                                    let cleanS = args.slidesData.replace(/```json/gi, '').replace(/```/g, '').trim();
                                    processedUpdData = JSON.parse(cleanS.replace(/\n/g, ' ').replace(/\r/g, '').replace(/\t/g, ' '));
                                } else if (Array.isArray(args.slidesData)) {
                                    processedUpdData = args.slidesData;
                                } else {
                                    toolResult = { isTerminal: true, reply: "⚠️ **簡報更新失敗**\n\nAI 生成的簡報資料格式無效 (不是陣列)。" }; break;
                                }
                            } catch(e) { 
                                toolResult = { isTerminal: true, reply: `⚠️ **簡報更新失敗**\n\n簡報資料格式錯誤，無法解析 JSON：\n${e.toString()}` }; break;
                            }

                            updateGeometricSlides(presIdMatch[0], args.action, processedUpdData, updTheme, args.shapeStyle || 'minimalist', config.configData.autoImageEnabled, config.apiKey, config.artistModel);
                            
                            let actionVerb = (String(args.action).toLowerCase().trim() === 'overwrite') ? "覆寫" : "擴充";
                            toolResult = { 
                                isTerminal: true, 
                                reply: `📊 **簡報${actionVerb}完畢！**\n\n已成功將 ${processedUpdData.length} 頁內容同步至簡報中。\n🔗 [點擊開啟驗證](https://docs.google.com/presentation/d/${presIdMatch[0]}/edit)`,
                                html_presentation_data: {
                                    topic: "更新後的簡報",
                                    theme: updTheme,
                                    style: args.shapeStyle || 'minimalist',
                                    slides: processedUpdData
                                }
                            };
                            break;
                            
                        case "run_cloud_sandbox_code":
                            try {
                                let sandboxApiKey = PropertiesService.getScriptProperties().getProperty('SANDBOX_API_KEY') || (config && config.SANDBOX_API_KEY);
                                if (sandboxApiKey) sandboxApiKey = sandboxApiKey.trim();
                                let finalOutput = "";
                                
                                if (sandboxApiKey && sandboxApiKey !== "null") {
                                    try {
                                        const sandboxUrl = "https://api.e2b.app/sandboxes";
                                        const headers = { 
                                            "X-API-Key": sandboxApiKey,
                                            "Authorization": "Bearer " + sandboxApiKey, 
                                            "Content-Type": "application/json" 
                                        };
                                        
                                        const sessionKey = 'sandbox_' + (config.sessionId || "default");
                                        let sandboxID = PropertiesService.getScriptProperties().getProperty(sessionKey);
                                        
                                        let needsCreate = !sandboxID;
                                        if (sandboxID) {
                                            try {
                                                let testRes = UrlFetchApp.fetch(`${sandboxUrl}/${sandboxID}`, { method: "get", headers: headers, muteHttpExceptions: true });
                                                if (testRes.getResponseCode() !== 200) {
                                                    needsCreate = true;
                                                }
                                            } catch(e) { needsCreate = true; }
                                        }
                                        
                                        if (needsCreate) {
                                            let createRes = UrlFetchApp.fetch(sandboxUrl, { method: "post", headers: headers, payload: JSON.stringify({ templateID: "base" }) });
                                            let sandbox = JSON.parse(createRes.getContentText());
                                            sandboxID = sandbox.sandboxID;
                                            
                                            PropertiesService.getScriptProperties().setProperty(sessionKey, sandboxID);
                                        }
                                        
                                        const runConnectRpc = function(apiKey, id, commandStr) {
                                            const payload = {
                                                process: {
                                                    cmd: "/bin/bash",
                                                    args: ["-c", commandStr]
                                                }
                                            };
                                            const jsonStr = JSON.stringify(payload);
                                            const jsonBytes = Utilities.newBlob(jsonStr).getBytes();
                                            const len = jsonBytes.length;
                                            
                                            const toSigned = function(val) { return val > 127 ? val - 256 : val; };
                                            const headerBytes = [
                                                0,
                                                toSigned((len >> 24) & 0xFF),
                                                toSigned((len >> 16) & 0xFF),
                                                toSigned((len >> 8) & 0xFF),
                                                toSigned(len & 0xFF)
                                            ];
                                            
                                            const totalBytes = headerBytes.concat(jsonBytes);
                                            const blob = Utilities.newBlob(totalBytes);
                                            
                                            const rpcUrl = "https://sandbox.e2b.app/process.Process/Start";
                                            const rpcHeaders = {
                                                "X-API-Key": apiKey,
                                                "E2b-Sandbox-Id": id,
                                                "E2b-Sandbox-Port": "49983",
                                                "Content-Type": "application/connect+json",
                                                "connect-protocol-version": "1"
                                            };
                                            
                                            const response = UrlFetchApp.fetch(rpcUrl, {
                                                method: "post",
                                                headers: rpcHeaders,
                                                payload: blob,
                                                muteHttpExceptions: true
                                            });
                                            
                                            if (response.getResponseCode() !== 200) {
                                                throw new Error("Connect RPC failed: " + response.getContentText());
                                            }
                                            
                                            const responseBytes = response.getContent();
                                            let offset = 0;
                                            let stdout = "";
                                            let stderr = "";
                                            
                                            while (offset < responseBytes.length) {
                                                if (offset + 5 > responseBytes.length) break;
                                                const flags = responseBytes[offset];
                                                const msgLen = (responseBytes[offset+1] << 24) | (responseBytes[offset+2] << 16) | (responseBytes[offset+3] << 8) | responseBytes[offset+4];
                                                offset += 5;
                                                
                                                if (offset + msgLen > responseBytes.length) break;
                                                
                                                const chunkBytes = responseBytes.slice(offset, offset + msgLen);
                                                offset += msgLen;
                                                
                                                const chunkText = Utilities.newBlob(chunkBytes).getDataAsString("UTF-8");
                                                const msg = JSON.parse(chunkText);
                                                
                                                if (msg.event) {
                                                    const event = msg.event;
                                                    if (event.data) {
                                                        if (event.data.stdout) {
                                                            stdout += Utilities.newBlob(Utilities.base64Decode(event.data.stdout)).getDataAsString("UTF-8");
                                                        }
                                                        if (event.data.stderr) {
                                                            stderr += Utilities.newBlob(Utilities.base64Decode(event.data.stderr)).getDataAsString("UTF-8");
                                                        }
                                                    }
                                                }
                                            }
                                            return { stdout: stdout, stderr: stderr };
                                        };
                                        
                                        if (args.files_to_create && Array.isArray(args.files_to_create)) {
                                            for (let f of args.files_to_create) {
                                                const b64 = Utilities.base64Encode(Utilities.newBlob(f.content).getBytes());
                                                const fileCmd = `python3 -c "import base64; import os; os.makedirs(os.path.dirname('${f.path}'), exist_ok=True) if os.path.dirname('${f.path}') else None; open('${f.path}', 'wb').write(base64.b64decode('${b64}'))"`;
                                                runConnectRpc(sandboxApiKey, sandboxID, fileCmd);
                                            }
                                        }
                                        
                                        let cmd = args.language === 'python' ? `python3 -c "${args.code.replace(/"/g, '\\\\"')}"` : args.code;
                                        if (args.language === 'python' && args.code.includes('\n')) {
                                            const b64 = Utilities.base64Encode(Utilities.newBlob(args.code).getBytes());
                                            const writeCmd = `python3 -c "import base64; open('main.py', 'wb').write(base64.b64decode('${b64}'))"`;
                                            runConnectRpc(sandboxApiKey, sandboxID, writeCmd);
                                            cmd = "python3 main.py";
                                        }
                                        
                                        const result = runConnectRpc(sandboxApiKey, sandboxID, cmd);
                                        finalOutput = result.stdout || result.stderr || "(無輸出)";

                                    } catch (err) {
                                        if (err.toString().includes("401")) {
                                            console.warn("E2B Key 無效，自動切換至 Piston 備援模式");
                                            sandboxApiKey = null;
                                        } else throw err;
                                    }
                                }
                                
                                if (!sandboxApiKey || sandboxApiKey === "null") {
                                    const pistonUrl = "https://emkc.org/api/v2/piston/execute";
                                    const payload = {
                                        language: args.language === 'shell' ? 'bash' : 'python',
                                        version: args.language === 'shell' ? '5.2.0' : '3.10.0',
                                        files: [{ content: args.code }]
                                    };
                                    
                                    const res = UrlFetchApp.fetch(pistonUrl, {
                                        method: "post",
                                        contentType: "application/json",
                                        payload: JSON.stringify(payload),
                                        muteHttpExceptions: true
                                    });
                                    
                                    if (res.getResponseCode() === 200) {
                                        const result = JSON.parse(res.getContentText());
                                        finalOutput = result.run.stdout || result.run.stderr || "(無輸出)";
                                        if (result.run.code !== 0 && !finalOutput) finalOutput = "執行失敗，代碼：" + result.run.code;
                                    } else {
                                        toolResult = { 
                                            isTerminal: true,
                                            reply: "🔄 **正在啟動瀏覽器 Python 引擎 (Pyodide) 進行運算...**",
                                            python_browser_request: { 
                                                code: args.code, 
                                                language: args.language 
                                            } 
                                        };
                                        break;
                                    }
                                }
                                
                                toolResult = { 
                                    status: "success", 
                                    isTerminal: true,
                                    reply: `🚀 **雲端電腦任務執行完畢** ${sandboxApiKey ? "" : "(免密碼模式)"}\n\n語言：${args.language}\n輸出結果：\n\`\`\`\n${finalOutput}\n\`\`\``,
                                    data: { output: finalOutput } 
                                };
                            } catch(e) { toolResult = { status: "error", error_message: `雲端電腦執行失敗: ${e.toString()}` }; }
                            break;

                        case "local_disk_search":
                        case "local_disk_browse":
                        case "local_disk_read":
                        case "local_disk_organize":
                        case "local_run_command":
                        case "local_write_file":
                        case "local_docker_run_command":
                            const actionLabels = {
                                "local_run_command": "💻 **準備執行本機終端機指令...**",
                                "local_write_file": "📝 **準備寫入本機檔案...**",
                                "local_docker_run_command": "🐳 **準備啟動 Docker 隔離沙盒...**"
                            };
                            toolResult = {
                                isTerminal: true,
                                reply: actionLabels[fnName] || `🔍 **正在存取本機磁碟...**`,
                                local_agent_request: {
                                    tool: fnName,
                                    args: args
                                }
                            };
                            break;
                            
                        case "design_document":
                            try {
                                const docTitle = args.title || "文件";
                                const mood = args.contentMood || "商務/正式";
                                const palette = args.colorPalette || {};
                                const primary = palette.primary || "#1a365d";
                                const secondary = palette.secondary || "#2d6a9f";
                                const accent = palette.accent || "#e67e22";
                                const bgColor = palette.bg || "#ffffff";
                                const textColor = palette.text || "#1a1a2e";
                                const typo = args.typography || "sans";
                                const layout = args.layoutStyle || "single_column";
                                const sections = args.sections || [];

                                const fontMap = {
                                    sans: "'Inter', 'Noto Sans TC', sans-serif",
                                    serif: "'Merriweather', 'Noto Serif TC', serif",
                                    mono: "'JetBrains Mono', 'Noto Sans TC', monospace"
                                };
                                const fontFamily = fontMap[typo] || fontMap.sans;

                                const isTwo = layout === 'two_column' || layout === 'magazine';

                                let sectionsHtml = sections.map((sec, i) => {
                                    const sType = sec.type || 'body';
                                    let inner = '';
                                    if (sType === 'hero') {
                                        inner = `<div class="doc-hero" style="background:linear-gradient(135deg,${primary},${secondary});color:#fff;padding:4rem 3rem;border-radius:16px;margin-bottom:2rem;">
                                            <h1 style="font-size:2.5rem;font-weight:800;margin-bottom:1rem;">${sec.title || docTitle}</h1>
                                            <p style="font-size:1.2rem;opacity:0.9;line-height:1.8;">${(sec.content || '').replace(/\n/g, '<br>')}</p>
                                        </div>`;
                                    } else if (sType === 'quote') {
                                        inner = `<blockquote style="border-left:5px solid ${accent};padding:1.5rem 2rem;background:${primary}15;margin:2rem 0;border-radius:0 12px 12px 0;">
                                            <p style="font-size:1.3rem;font-style:italic;color:${primary};">${sec.content || ''}</p>
                                            ${sec.title ? `<cite style="display:block;margin-top:0.8rem;font-size:0.9rem;color:${secondary};">— ${sec.title}</cite>` : ''}
                                        </blockquote>`;
                                    } else if (sType === 'highlight_box') {
                                        inner = `<div style="background:${accent}18;border:2px solid ${accent};border-radius:12px;padding:1.5rem 2rem;margin:1.5rem 0;">
                                            ${sec.title ? `<h4 style="color:${accent};margin-bottom:0.8rem;font-weight:700;">💡 ${sec.title}</h4>` : ''}
                                            <p style="line-height:1.8;">${(sec.content || '').replace(/\n/g, '<br>')}</p>
                                        </div>`;
                                    } else if (sType === 'data_table' && sec.data) {
                                        const rows = Array.isArray(sec.data) ? sec.data : [];
                                        const header = rows[0] || [];
                                        const body = rows.slice(1);
                                        inner = `<div style="overflow-x:auto;margin:1.5rem 0;">
                                            ${sec.title ? `<h3 style="color:${primary};margin-bottom:1rem;">${sec.title}</h3>` : ''}
                                            <table style="width:100%;border-collapse:collapse;font-size:0.95rem;">
                                                <thead><tr style="background:${primary};color:#fff;">${header.map(h => `<th style="padding:0.8rem 1rem;text-align:left;border:1px solid ${primary};">${h}</th>`).join('')}</tr></thead>
                                                <tbody>${body.map((row, ri) => `<tr style="background:${ri%2===0?bgColor:primary+'10'};">${(Array.isArray(row)?row:[row]).map(cell => `<td style="padding:0.7rem 1rem;border:1px solid ${primary}30;">${cell}</td>`).join('')}</tr>`).join('')}</tbody>
                                            </table>
                                        </div>`;
                                    } else if (sType === 'summary') {
                                        inner = `<div style="background:${secondary}12;border-radius:12px;padding:1.8rem 2rem;margin:1.5rem 0;">
                                            ${sec.title ? `<h3 style="color:${secondary};margin-bottom:1rem;border-bottom:2px solid ${accent};padding-bottom:0.5rem;">📋 ${sec.title}</h3>` : ''}
                                            <p style="line-height:1.9;">${(sec.content || '').replace(/\n/g, '<br>')}</p>
                                        </div>`;
                                    } else {
                                        inner = `<div style="margin:2rem 0;">
                                            ${sec.title ? `<h2 style="color:${primary};font-size:1.5rem;font-weight:700;margin-bottom:1rem;padding-bottom:0.5rem;border-bottom:3px solid ${accent};">${sec.title}</h2>` : ''}
                                            <div style="line-height:1.9;color:${textColor};">${(sec.content || '').replace(/\n/g, '<br>')}</div>
                                        </div>`;
                                    }
                                    return inner;
                                }).join('');

                                const gridStyle = isTwo ? `display:grid;grid-template-columns:1fr 1fr;gap:2rem;` : '';
                                const docHtml = `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${docTitle}</title>
                                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&family=Merriweather:wght@400;700&family=JetBrains+Mono&family=Noto+Sans+TC:wght@400;700&family=Noto+Serif+TC:wght@400;700&display=swap" rel="stylesheet">
                                <style>
                                    *{box-sizing:border-box;margin:0;padding:0;}
                                    body{font-family:${fontFamily};background:${bgColor};color:${textColor};line-height:1.8;}
                                    .doc-wrapper{max-width:900px;margin:0 auto;padding:3rem 2rem;}
                                    .doc-header{text-align:center;padding:3rem 0 2rem;border-bottom:3px solid ${accent};}
                                    .doc-header h1{font-size:2.2rem;color:${primary};font-weight:800;}
                                    .doc-header .meta{color:${secondary};margin-top:0.5rem;font-size:0.95rem;}
                                    .doc-content{${gridStyle}}
                                    h2{color:${primary};} h3{color:${secondary};}
                                    @media print{body{background:#fff;} .doc-wrapper{padding:1rem;}}
                                </style></head>
                                <body><div class="doc-wrapper">
                                    <div class="doc-header">
                                        <h1>${docTitle}</h1>
                                        <p class="meta">${mood} · ${new Date().toLocaleDateString('zh-TW')}</p>
                                    </div>
                                    <div class="doc-content">${sectionsHtml}</div>
                                    <footer style="text-align:center;padding:2rem 0;color:${secondary};font-size:0.85rem;border-top:1px solid ${primary}20;margin-top:3rem;">由 anyGem AI 動態設計生成</footer>
                                </div></body></html>`;

                                toolResult = {
                                    isTerminal: true,
                                    reply: `📄 **「${docTitle}」設計完成！**\n\n🎨 設計風格：${mood}\n🖋️ 字型：${typo} | 排版：${layout}\n\n已根據文義動態選配色彩與版面，可直接預覽或列印。`,
                                    html_presentation_data: {
                                        topic: docTitle,
                                        theme: { colors: { background: bgColor, text: textColor, accent: accent, shape: secondary } },
                                        style: 'document',
                                        rawHtml: docHtml,
                                        slides: []
                                    }
                                };
                            } catch(e) { toolResult = { status: "error", error_message: `文件設計失敗: ${e.toString()}` }; }
                            break;

                        case "execute_dynamic_tool":
                            toolResult = { 
                                isTerminal: true, 
                                reply: `✨ **動態工具「${args.tool_name}」已合成並啟動！**\n\n功能：${args.description}\n\n您可以直接在畫面中操作此工具。`,
                                html_artifact_data: {
                                    name: args.tool_name,
                                    description: args.description,
                                    code: args.html_code
                                }
                            };
                            break;
                            
                        default:
                            toolResult = { status: "success", reply: `工具 ${fnName} 已處理` };
                    }
                } catch (e) { toolResult = { status: "error", error_message: e.toString() }; }

                if (toolResult.isTerminal) { 
                    let combinedReply = aiTextGenerated ? (aiTextGenerated + "\n\n---\n\n" + toolResult.reply) : toolResult.reply;
                    return { 
                        reply: combinedReply, 
                        model: "Agent-Executor", 
                        image: finalImage, 
                        mime: finalMime, 
                        html_presentation: toolResult.html_presentation_data || null, 
                        html_artifact: toolResult.html_artifact_data || null,
                        python_browser_request: toolResult.python_browser_request || null,
                        local_agent_request: toolResult.local_agent_request || null
                    }; 
                }
                toolResponses.push({ functionResponse: { name: fnName, response: toolResult, id: part.functionCall.id } });
            }
            currentHistory.push({ role: "user", parts: toolResponses });
            isFirstTurn = false; continue;
        } else {
            finalReply = responseParts.map(p => p.text || "").join("\n").trim(); break;
        }
    }
    
    if (iterations >= MAX_ITERATIONS) finalReply = "⚠️ 任務過於複雜，已達到單次執行上限。\n\n" + finalReply;
    if (!finalReply && !finalImage) finalReply = "⚠️ 系統已接收指令，但未產出任何內容或動作。";
    if (!finalReply && finalImage) finalReply = "🎨 圖像繪製完成。";
    if (finalReply && !finalImage) { finalReply = performInnerQALoop(finalReply, config.apiKey, false); }
    
    return { reply: finalReply, model: finalModel, image: finalImage, mime: finalMime };
}

function callGeminiAPI_Raw({ prompt, model, apiKey, systemInstruction, history = [], tools = [], imageData = null, isFunctionResponse = false }) {
    const contents = history.map(x => ({ role: x.role, parts: x.parts ? [...x.parts] : [{ text: x.content || "" }] }));
    if (!isFunctionResponse && prompt) {
        let userPart = imageData ? [{ text: prompt }, { inlineData: { mimeType: imageData.mimeType, data: imageData.data } }] : [{ text: prompt }];
        if (contents.length > 0 && contents[contents.length - 1].role === "user") { contents[contents.length - 1].parts.push(...userPart); }
        else { contents.push({ role: 'user', parts: userPart }); }
    }
    const payload = { contents: contents };
    if (tools.length > 0) payload.tools = tools;
    if (systemInstruction) payload.system_instruction = { parts: [{ text: systemInstruction }] };

    const urlTemplate = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key={KEY}`;
    return fetchGoogleAPIWithRotation(urlTemplate, payload, apiKey, "post");
}

function fetchAIImage(prompt, key, model, aspectRatio = "16:9") {
    let lastError = null;
    let urlTemplate, payload;
    
    if (model.includes("imagen")) {
        urlTemplate = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key={KEY}`;
        const validRatios = ["1:1", "3:4", "4:3", "9:16", "16:9"];
        let safeRatio = validRatios.includes(aspectRatio) ? aspectRatio : "1:1";
        payload = { instances: [{ prompt: prompt }], parameters: { sampleCount: 1, aspectRatio: safeRatio } };
    } else {
        urlTemplate = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key={KEY}`;
        let finalPrompt = prompt;
        if (aspectRatio && aspectRatio !== "1:1") finalPrompt += ` (Aspect Ratio: ${aspectRatio})`;
        payload = { contents: [{ parts: [{ text: finalPrompt }] }], generationConfig: { responseModalities: ["IMAGE"] } };
    }
    
    try {
        const resJson = fetchGoogleAPIWithRotation(urlTemplate, payload, key, "post");
        
        if (model.includes("imagen")) {
            if (resJson.predictions && resJson.predictions[0] && resJson.predictions[0].bytesBase64Encoded) {
                return Utilities.newBlob(Utilities.base64Decode(resJson.predictions[0].bytesBase64Encoded), "image/png");
            } else {
                throw new Error(`Google API 回傳了預期外的格式 (可能模型不支援)：${JSON.stringify(resJson).substring(0, 100)}...`);
            }
        } else { 
            let base64Data = resJson.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data; 
            if (!base64Data) base64Data = resJson.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data; 
            if (base64Data) { return Utilities.newBlob(Utilities.base64Decode(base64Data), "image/png"); } 
            else {
                let txtFallback = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
                throw new Error(txtFallback ? `模型無法產生圖片，回傳了文字：${txtFallback}` : "API 回傳成功，但未包含影像資料");
            }
        }
    } catch (e) { lastError = e.toString(); }
    return lastError ? `ERROR:${lastError}` : null;
}

function getOptimizedHistoryFB(db, wsName, sessionId) {
    const cache = CacheService.getScriptCache(); const cacheKey = `history_${wsName}_${sessionId}`;
    const cachedData = cache.get(cacheKey); if (cachedData) return JSON.parse(cachedData);
    try {
        const session = db.get("sessions", sessionId); if (!session || !session.history_json) return [];
        let hist = []; try { hist = Array.isArray(session.history_json) ? session.history_json : JSON.parse(session.history_json); } catch(e) {}
        const geminiHistory = []; const MAX_CHARS = 40000; let charCount = 0;
        for (let i = hist.length - 1; i >= 0; i--) {
            const msg = hist[i]; let text = msg.text || ""; 
            if (msg.html_presentation) text += `\n\n【系統紀錄：已生成的簡報 JSON 內容 (供修改參考)】\n${JSON.stringify(msg.html_presentation).substring(0, 15000)}`;
            if (!text.trim()) continue;
            if (charCount + text.length > MAX_CHARS) break;
            let r = (msg.role === 'ai') ? 'model' : 'user'; geminiHistory.unshift({ role: r, content: text }); charCount += text.length;
        }
        cache.put(cacheKey, JSON.stringify(geminiHistory), 21600); return geminiHistory;
    } catch(e) { return []; }
}

function logToFirebaseAndCache(db, wsName, sessionId, userMsg, aiReply, htmlPresentation = null, htmlArtifact = null, image = null, mime = null, model = null) {
    const lock = LockService.getScriptLock();
    try {
        lock.waitLock(10000);
        let session = db.get("sessions", sessionId);
        if (!session) { session = { workspace: wsName, session_id: sessionId, title: userMsg ? userMsg.substring(0, 25) : "新對話", pinned: false, history_json: [] }; }
        let hist = []; if (session.history_json) { try { hist = Array.isArray(session.history_json) ? session.history_json : JSON.parse(session.history_json); } catch(e) {} }
        if (userMsg) hist.push({ role: "user", text: userMsg }); 
        if (aiReply) {
            const aiMsg = { role: "ai", text: aiReply };
            if (htmlPresentation) aiMsg.html_presentation = htmlPresentation;
            
            if (htmlArtifact) {
                let driveFileId = htmlArtifact.fileId || null;
                if (htmlArtifact.code) {
                    driveFileId = saveArtifactToDrive(htmlArtifact.code, htmlArtifact.name);
                }
                aiMsg.html_artifact = {
                    name: htmlArtifact.name,
                    description: htmlArtifact.description,
                    fileId: driveFileId
                };
            }
            
            if (image) {
                const driveImageUrl = saveImageToDrive(image);
                if (driveImageUrl) {
                    aiMsg.image = driveImageUrl;
                    aiMsg.isDriveImage = true;
                } else {
                    aiMsg.image = image;
                }
                aiMsg.mime = mime;
            }
            
            if (model) aiMsg.model = model;
            hist.push(aiMsg);
        }
session.updated_at = new Date(); session.history_json = hist; db.write("sessions", sessionId, session);
    } catch(e) {
        console.error("logToFirebaseAndCache 失敗:", e);
    } finally { lock.releaseLock(); }
    try {
        const cache = CacheService.getScriptCache(); const cacheKey = `history_${wsName}_${sessionId}`; let currentHistory = cache.get(cacheKey);
        if (currentHistory) {
            let h = JSON.parse(currentHistory); if(userMsg) h.push({ role: "user", content: userMsg }); if(aiReply) h.push({ role: "model", content: aiReply });
            if (h.length > 20) h = h.slice(h.length - 20); cache.put(cacheKey, JSON.stringify(h), 21600);
        }
    } catch(e) {}
}

function extractTextFromPresentation(presentationId) {
    const presentation = SlidesApp.openById(presentationId);
    const slides = presentation.getSlides();
    let fullText = "";
    
    slides.forEach((slide, index) => {
        fullText += `\n--- 第 ${index + 1} 頁 ---\n`;
        const elements = slide.getPageElements();
        
        elements.forEach(el => {
            if (el.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
                const text = el.asShape().getText().asString().trim();
                if (text) fullText += text + "\n";
            } else if (el.getPageElementType() === SlidesApp.PageElementType.TABLE) {
                const table = el.asTable();
                for (let r = 0; r < table.getNumRows(); r++) {
                    let rowText = [];
                    for (let c = 0; c < table.getNumColumns(); c++) {
                        rowText.push(table.getCell(r, c).getText().asString().replace(/\n/g, ' ').trim());
                    }
                    fullText += "| " + rowText.join(" | ") + " |\n";
                }
            }
        });
        
        const notesPage = slide.getNotesPage();
        if (notesPage) {
            let notesStr = "";
            notesPage.getPageElements().forEach(el => {
                if (el.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
                    const t = el.asShape().getText().asString().trim();
                    if (t) notesStr += t + "\n";
                }
            });
            if (notesStr.trim()) fullText += `[講者備忘錄]:\n${notesStr}\n`;
        }
    });
    return fullText.substring(0, 30000);
}

function extractTextFromAnyFile(file, apiKey) {
    try {
        const mimeType = file.getMimeType();
        
        if (mimeType === MimeType.GOOGLE_DOCS) return DocumentApp.openById(file.getId()).getBody().getText();
        if (mimeType === MimeType.GOOGLE_SHEETS) {
            const ss = SpreadsheetApp.openById(file.getId());
            return ss.getSheets().map(sh => sh.getName() + ":\n" + sh.getDataRange().getDisplayValues().map(r => r.join("\t")).join("\n")).join("\n\n");
        }
        if (mimeType === MimeType.GOOGLE_SLIDES) return extractTextFromPresentation(file.getId());
        if (mimeType === MimeType.PLAIN_TEXT || mimeType === MimeType.CSV) return file.getBlob().getDataAsString();
        
        if (mimeType === MimeType.PDF || mimeType.startsWith('image/')) {
            try {
                const resource = {
                    title: "Temp_OCR_" + file.getName(),
                    mimeType: MimeType.GOOGLE_DOCS
                };
                const tempDoc = Drive.Files.copy(resource, file.getId(), { ocr: true, ocrLanguage: 'zh-TW' });
                
                const ocrText = DocumentApp.openById(tempDoc.id).getBody().getText();
                
                Drive.Files.remove(tempDoc.id);
                
                return ocrText ? ocrText.substring(0, 30000) : "【系統提示】OCR 辨識成功，但未能提取出任何文字 (可能圖片解析度過低)。";
            } catch (ocrErr) {
                return `【系統提示】嘗試對 PDF/圖片 進行 OCR 辨識時失敗: ${ocrErr.toString()}。請確認已在 GAS 服務中開啟 Drive API。`;
            }
        }
        
        return `【系統提示】已找到檔案 (${file.getName()})。此為特殊格式 (${mimeType})，目前系統尚未支援直接讀取其內容。`;
    } catch (e) {
        return `檔案內容讀取失敗: ${e.toString()}`;
    }
}

function getOrCreateSubFolder(parentFolder, folderName) { 
    let iter = parentFolder.getFoldersByName(folderName); 
    return iter.hasNext() ? iter.next() : parentFolder.createFolder(folderName); 
}

function moveFileToFolderByName(fileId, folderName) { 
    try { 
        if (!folderName) return null; 
        let file = DriveApp.getFileById(fileId); 
        let folders = DriveApp.getFoldersByName(folderName); 
        let folder; 
        if (folders.hasNext()) { folder = folders.next(); } 
        else { folder = DriveApp.createFolder(folderName); } 
        file.moveTo(folder); 
        return folder.getUrl(); 
    } catch(e) { return null; } 
}

function fetchWebImage(keyword) {
    const pixabayKey = "4845800-e5965ba23d7d985fa9f2b3f01";
    try {
        const safeKeyword = encodeURIComponent(keyword.trim());
        const pbUrl = `https://pixabay.com/api/?key=${pixabayKey}&q=${safeKeyword}&image_type=photo&per_page=3&safesearch=true`;
        const pbRes = UrlFetchApp.fetch(pbUrl, { muteHttpExceptions: true });
        if (pbRes.getResponseCode() === 200) {
            const pbData = JSON.parse(pbRes.getContentText());
            if (pbData.hits && pbData.hits.length > 0) {
                const imgRes = UrlFetchApp.fetch(pbData.hits[0].largeImageURL, { muteHttpExceptions: true });
                if (imgRes.getResponseCode() === 200) return imgRes.getBlob();
            }
        }
    } catch (e) { console.warn("Pixabay fetch failed", e); }

    try {
        const safeKeyword = encodeURIComponent(keyword.trim());
        const wmUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${safeKeyword}&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url&format=json`;
        const wmRes = UrlFetchApp.fetch(wmUrl, { muteHttpExceptions: true });
        if (wmRes.getResponseCode() === 200) {
            const data = JSON.parse(wmRes.getContentText());
            if (data.query && data.query.pages) {
                const firstPageId = Object.keys(data.query.pages)[0];
                const imageInfo = data.query.pages[firstPageId].imageinfo;
                if (imageInfo && imageInfo.length > 0 && imageInfo[0].url) {
                    const imgRes = UrlFetchApp.fetch(imageInfo[0].url, { muteHttpExceptions: true });
                    if (imgRes.getResponseCode() === 200) return imgRes.getBlob();
                }
            }
        }
    } catch (e) { console.warn("Wikimedia fetch failed", e); }
    return null;
}

function appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel) {
    let mainShape = SlidesApp.ShapeType.RECTANGLE; let coverShape = SlidesApp.ShapeType.ELLIPSE; let isMinimal = (style === 'minimalist'); let alphaMod = (style === 'layered') ? 0.3 : 1;
    if (style === 'rounded') { mainShape = SlidesApp.ShapeType.ROUND_RECTANGLE; coverShape = SlidesApp.ShapeType.ROUND_RECTANGLE; } else if (style === 'cyber') { mainShape = SlidesApp.ShapeType.RIGHT_TRIANGLE; coverShape = SlidesApp.ShapeType.RIGHT_TRIANGLE; } else if (style === 'dynamic') { mainShape = SlidesApp.ShapeType.PARALLELOGRAM; coverShape = SlidesApp.ShapeType.PARALLELOGRAM; }

    slidesData.forEach((d, i) => {
        const slide = deck.appendSlide(SlidesApp.PredefinedLayout.BLANK); 
        const slideColors = theme.colors || theme;
        slide.getBackground().setSolidFill(slideColors.background || slideColors.bg || "#ffffff");
        let layoutType = (i === 0) ? 'cover' : (d.layout || 'standard_list');
        let imgBlob = null; let keyword = d.imageKeyword || d.title || "presentation";
        const needsLargeImage = ['cover', 'image_right', 'image_left', 'image_top', 'image_bottom', 'profile_quote', 'split_column', 'standard_list'].includes(layoutType);

        if (enableAutoImage) {
            if (needsLargeImage && keyword) {
                if (d.imageSource !== 'ai') {
                    let result = fetchWebImage(keyword);
                    if (result) imgBlob = result;
                }
                if (!imgBlob) {
                    Utilities.sleep(4000); let ratio = (layoutType === 'profile_quote') ? "1:1" : "16:9";
                    let result = fetchAIImage(`Professional presentation slide asset, high quality photography, no text, ${keyword}`, apiKey, artistModel, ratio);
                    if (result && typeof result !== 'string') imgBlob = result;
                }
            }
        }
        
        let safeContent = d.content || (d.points && Array.isArray(d.points) ? d.points.join('\n') : "");
        const c = theme.colors || theme;
        const c_bg = c.background || c.bg || "#ffffff";
        const c_text = c.text || "#000000";
        const c_accent = c.accent || "#38bdf8";
        const c_shape = c.shape || "#f1f5f9";

        let titleText = d.title || ""; let eyebrow = d.label || "";
        if (!eyebrow && titleText.match(/【(.*?)】/)) { eyebrow = titleText.match(/【(.*?)】/)[0]; titleText = titleText.replace(eyebrow, '').trim(); }

        switch(layoutType) {
            case 'cover':
            case 'title':
                if (imgBlob) { 
                    try { slide.insertImage(imgBlob, 0, 0, 720, 405); drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 0, 0, 720, 405, c_bg, 0.75); } catch(e) {} 
                } else {
                    addMaterialIcon(slide, d.imageKeyword || d.titleIconKeyword || "co_present", 360-60, 160, 120, c_accent);
                }
                drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 360-15, 60, 30, 4, c_accent, 1);
                addText(slide, eyebrow.replace(/[【】]/g, ''), 210, 80, 300, 30, c_accent, 16, true, SlidesApp.ParagraphAlignment.CENTER);
                addText(slide, titleText || "未命名標題", 110, 140, 500, 100, c_text, 42, true, SlidesApp.ParagraphAlignment.CENTER);
                addText(slide, d.subtitle || safeContent, 160, 260, 400, 50, c_accent, 18, false, SlidesApp.ParagraphAlignment.CENTER);
                addText(slide, "Agent Generated Editorial", 260, 370, 200, 20, c_text, 10, false, SlidesApp.ParagraphAlignment.CENTER);
                break;
            case 'hero_quote':
                addText(slide, eyebrow, 50, 40, 620, 30, c_accent, 14, true);
                addText(slide, safeContent || slide.subtitle || '金句內容', 80, 120, 560, 160, c_text, 36, true, SlidesApp.ParagraphAlignment.CENTER);
                addText(slide, "— " + (titleText || '講者'), 160, 300, 400, 40, c_accent, 18, false, SlidesApp.ParagraphAlignment.CENTER);
                break;
            case 'stepper':
            case 'timeline':
                addText(slide, eyebrow, 50, 40, 620, 30, c_accent, 14, true);
                addText(slide, titleText || "發展歷程", 50, 70, 620, 40, c_text, 28, true);
                if (d.gridItems && Array.isArray(d.gridItems)) {
                    let tCount = Math.min(d.gridItems.length, 4);
                    let tWidth = 620 / tCount;
                    drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 50, 160, 620, 2, c_accent, 0.3);
                    d.gridItems.forEach((item, idx) => {
                        if (idx >= 4) return;
                        let tx = 50 + (idx * tWidth);
                        drawShape(slide, SlidesApp.ShapeType.ELLIPSE, tx + 10, 155, 12, 12, c_accent, 1);
                        addText(slide, item.title, tx, 180, tWidth-10, 40, c_accent, 18, true);
                        addText(slide, item.content, tx, 220, tWidth-10, 100, c_text, 12, false);
                    });
                }
                break;
            case 'split_column':
            case 'image_left':
            case 'image_right':
                addMaterialIcon(slide, d.titleIconKeyword, 45, 40, 24, c_accent);
                if (imgBlob) {
                    try {
                        if (layoutType === 'image_left') {
                            slide.insertImage(imgBlob, 0, 0, 320, 405);
                            addText(slide, eyebrow, 350, 40, 320, 30, c_accent, 14, true);
                            addText(slide, titleText, 350, 80, 320, 100, c_text, 32, true);
                            addText(slide, safeContent, 350, 180, 320, 180, c_text, 14, false);
                        } else if (layoutType === 'image_right') {
                            slide.insertImage(imgBlob, 400, 0, 320, 405);
                            addText(slide, eyebrow, 50, 40, 320, 30, c_accent, 14, true);
                            addText(slide, titleText, 50, 80, 320, 100, c_text, 32, true);
                            addText(slide, safeContent, 50, 180, 320, 180, c_text, 14, false);
                        } else {
                            slide.insertImage(imgBlob, 0, 0, 720, 405);
                            drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 0, 0, 720, 405, c_bg, 0.85);
                            addText(slide, eyebrow, 50, 40, 300, 30, c_accent, 14, true);
                            addText(slide, titleText || "深度分析", 50, 80, 250, 120, c_text, 36, true);
                            addText(slide, d.left || d.content || "左側說明", 50, 220, 260, 150, c_text, 14, false);
                            drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 340, 60, 2, 300, c_accent, 0.3);
                            let rContent = d.right || (d.points && d.points.length > 0 ? d.points.map(p => "■  " + p).join('\n\n') : "右側內容");
                            addText(slide, rContent, 370, 70, 300, 300, c_accent, 16, false);
                        }
                    } catch(e) {}
                } else {
                    if (layoutType === 'image_left') {
                        addMaterialIcon(slide, d.imageKeyword || d.titleIconKeyword || "image", 100, 150, 120, c_accent);
                        addText(slide, eyebrow, 350, 40, 320, 30, c_accent, 14, true);
                        addText(slide, titleText, 350, 80, 320, 100, c_text, 32, true);
                        addText(slide, safeContent, 350, 180, 320, 180, c_text, 14, false);
                    } else if (layoutType === 'image_right') {
                        addMaterialIcon(slide, d.imageKeyword || d.titleIconKeyword || "image", 500, 150, 120, c_accent);
                        addText(slide, eyebrow, 50, 40, 320, 30, c_accent, 14, true);
                        addText(slide, titleText, 50, 80, 320, 100, c_text, 32, true);
                        addText(slide, safeContent, 50, 180, 320, 180, c_text, 14, false);
                    } else {
                        addText(slide, eyebrow, 50, 40, 300, 30, c_accent, 14, true);
                        addText(slide, titleText || "深度分析", 50, 80, 250, 120, c_text, 36, true);
                        addText(slide, d.left || d.content || "左側說明", 50, 220, 260, 150, c_text, 14, false);
                        drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 340, 60, 2, 300, c_accent, 0.3);
                        let rc = d.right || (d.points && d.points.length > 0 ? d.points.map(p => "■  " + p).join('\n\n') : "右側內容");
                        addText(slide, rc, 370, 70, 300, 300, c_accent, 16, false);
                    }
                }
                break;
            case 'card_deck':
            case 'icon_grid':
            case 'grid':
                addMaterialIcon(slide, d.titleIconKeyword, 45, 30, 24, c_accent);
                addText(slide, eyebrow, 50, 30, 620, 30, c_accent, 14, true);
                addText(slide, titleText || "核心要素", 50, 60, 620, 40, c_text, 28, true);
                if (d.gridItems && Array.isArray(d.gridItems) && d.gridItems.length > 0) {
                    let tCount = Math.min(d.gridItems.length, 4);
                    let spacing = 20; let tWidth = (620 - (spacing * (tCount - 1))) / tCount;
                    d.gridItems.forEach((item, idx) => {
                        if (idx >= 4) return;
                        let x = 50 + idx * (tWidth + spacing);
                        drawShape(slide, SlidesApp.ShapeType.RECTANGLE, x, 130, tWidth, 4, c_accent, 1);
                        addMaterialIcon(slide, item.iconKeyword || 'check_circle', x, 140, 20, c_accent);
                        addText(slide, item.title, x + 30, 140, tWidth - 30, 30, c_accent, 16, true);
                        addText(slide, item.content, x, 180, tWidth, 150, c_text, 12, false);
                    });
                }
                break;
            case 'big_data':
                addText(slide, eyebrow, 50, 40, 620, 30, c_accent, 14, true);
                addText(slide, titleText || "關鍵數據", 50, 70, 620, 40, c_text, 28, true);
                addText(slide, d.value || (d.points && d.points[0] ? d.points[0] : "99%"), 50, 130, 620, 150, c_accent, 86, true, SlidesApp.ParagraphAlignment.CENTER);
                addText(slide, safeContent || "數據背景說明", 50, 300, 620, 50, c_text, 18, false, SlidesApp.ParagraphAlignment.CENTER);
                break;
            case 'standard_list':
            default:
                addMaterialIcon(slide, d.titleIconKeyword, 45, 45, 24, c_accent);
                if (imgBlob) {
                    try {
                        slide.insertImage(imgBlob, 450, 60, 250, 300);
                        addText(slide, eyebrow, 50, 40, 380, 30, c_accent, 14, true);
                        addText(slide, titleText || "核心摘要", 50, 70, 380, 40, c_text, 32, true);
                        drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 50, 120, 60, 4, c_accent, 1);
                        let lc = (d.points && Array.isArray(d.points) && d.points.length > 0) ? d.points.map(p => "■  " + p).join('\n\n') : (safeContent || "【系統提示：AI 未生成內文】");
                        addText(slide, lc, 50, 150, 380, 220, c_text, 14, false);
                    } catch(e) {}
                } else {
                    addMaterialIcon(slide, d.imageKeyword || d.titleIconKeyword || "list", 520, 150, 100, c_accent);
                    addText(slide, eyebrow, 50, 40, 620, 30, c_accent, 14, true);
                    addText(slide, titleText || "核心摘要", 50, 70, 620, 40, c_text, 32, true);
                    drawShape(slide, SlidesApp.ShapeType.RECTANGLE, 50, 120, 60, 4, c_accent, 1);
                    let listContent = (d.points && Array.isArray(d.points) && d.points.length > 0) ? d.points.map(p => "■  " + p).join('\n\n') : (safeContent || "【系統提示：AI 未生成內文】");
                    addText(slide, listContent, 50, 150, 600, 220, c_text, 16, false);
                }
                break;
        }
    });
}

function createGeometricSlides(topic, slidesData, theme, style, enableAutoImage, apiKey, artistModel) {
    let deck;
    let templateId = null;
    try {
        const props = PropertiesService.getScriptProperties();
        const sheetId = props.getProperty('SHEET_ID') || "1pIYPf8v1paZz6OE2qnc5ht5aub8Rm7IA-TfD5kInct8";
        const ss = SpreadsheetApp.openById(sheetId);
        const settings = loadSettings(ss);
        const styleKey = `PPT_TEMPLATE_${String(style).toUpperCase()}_ID`;
        templateId = settings[styleKey] || settings['PPT_TEMPLATE_ID'];
    } catch(e) { console.warn("讀取簡報範本設定失敗:", e); }

    if (templateId) {
        try {
            const templateFile = DriveApp.getFileById(templateId);
            const copiedFile = templateFile.makeCopy(`PPT: ${topic}`);
            deck = SlidesApp.openById(copiedFile.getId());
            const slides = deck.getSlides();
            const tempSlide = deck.appendSlide(SlidesApp.PredefinedLayout.BLANK);
            slides.forEach(s => { try { s.remove(); } catch(err) {} });
            appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel);
            tempSlide.remove();
        } catch(e) {
            console.error("複製簡報範本失敗，改用空白簡報:", e);
            deck = SlidesApp.create(`PPT: ${topic}`);
            const slides = deck.getSlides(); if (slides.length > 0) slides[0].remove();
            appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel);
        }
    } else {
        deck = SlidesApp.create(`PPT: ${topic}`);
        const slides = deck.getSlides(); if (slides.length > 0) slides[0].remove();
        appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel);
    }

    deck.saveAndClose(); 
    try { DriveApp.getFileById(deck.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT); } catch(e) { console.error("權限設定失敗", e); }
    return deck.getId();
}

function updateGeometricSlides(presentationId, action, slidesData, theme, style, enableAutoImage, apiKey, artistModel) {
    const deck = SlidesApp.openById(presentationId);
    const safeAction = String(action || "").toLowerCase().trim();
    console.log(`[SlidesService] Action: ${safeAction}, ID: ${presentationId}, Slides: ${slidesData.length}`);
    
    if (safeAction === 'overwrite') {
        const tempSlide = deck.appendSlide(SlidesApp.PredefinedLayout.BLANK); 
        const slides = deck.getSlides();
        console.log(`[SlidesService] Overwriting... Removing ${slides.length - 1} old slides.`);
        slides.forEach(s => { if (s.getObjectId() !== tempSlide.getObjectId()) s.remove(); });
        appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel);
        tempSlide.remove(); 
    } else {
        console.log(`[SlidesService] Appending ${slidesData.length} new slides.`);
        appendSlidesToDeck(deck, slidesData, theme, style, enableAutoImage, apiKey, artistModel);
    }
    deck.saveAndClose();
}

function drawShape(s, t, x, y, w, h, c, a) { const sh = s.insertShape(t, x, y, w, h); sh.getBorder().setTransparent(); sh.getFill().setSolidFill(c, a); return sh; }
function addText(s, t, x, y, w, h, c, sz, b, align) { if(!t)return; const box = s.insertShape(SlidesApp.ShapeType.TEXT_BOX, x, y, w, h); const txt = box.getText(); let safeT = String(t).replace(/\\n/g, '\n'); txt.setText(safeT).getTextStyle().setFontSize(sz).setForegroundColor(c).setBold(b); if(align) txt.getParagraphStyle().setParagraphAlignment(align); return box; }

const ICON_MAP = {
    "image": "image", "photo": "photo_camera", "nature": "landscape", "scenery": "filter_hdr",
    "people": "group", "success": "emoji_events", "idea": "lightbulb", "check": "check_circle",
    "warning": "warning", "info": "info", "question": "help", "star": "star",
    "target": "track_changes", "growth": "trending_up", "money": "payments", "tech": "memory",
    "travel": "flight", "food": "restaurant", "health": "medical_services", "education": "school",
    "business": "business_center", "settings": "settings", "home": "home", "search": "search",
    "time": "schedule", "data": "bar_chart", "list": "format_list_bulleted", "map": "map",
    "history": "history", "future": "auto_awesome", "link": "link", "cloud": "cloud",
    "shield": "shield", "lock": "lock", "key": "key", "person": "person", "mail": "mail"
};

function mapKeywordToIcon(kw) {
    if (!kw) return "circle";
    const low = kw.toLowerCase().trim();
    for (const [key, icon] of Object.entries(ICON_MAP)) {
        if (low.includes(key)) return icon;
    }
    return "circle";
}

function addMaterialIcon(slide, keyword, x, y, size, color) {
    const iconCode = mapKeywordToIcon(keyword);
    const box = slide.insertShape(SlidesApp.ShapeType.TEXT_BOX, x, y, size * 2, size * 2);
    const txt = box.getText();
    txt.setText(iconCode);
    const style = txt.getTextStyle();
    style.setFontSize(size);
    style.setForegroundColor(color);
    style.setFontFamily("Material Icons"); 
    txt.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
    box.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);
    return box;
}

function forceAuthSetup() {
    SpreadsheetApp.getActiveSpreadsheet(); 
    DriveApp.getRootFolder();
    
    const doc = DocumentApp.create("Temp_Auth_Doc");
    DriveApp.getFileById(doc.getId()).setTrashed(true);
    
    const slide = SlidesApp.create("Temp_Auth_Slide");
    DriveApp.getFileById(slide.getId()).setTrashed(true);
    
    const form = FormApp.create("Temp_Auth_Form");
    DriveApp.getFileById(form.getId()).setTrashed(true);
    
    GmailApp.getInboxThreads(0, 1);
    CalendarApp.getDefaultCalendar();
    console.log("✅ 所有權限已成功開通。您可以把剛剛在雲端硬碟產生的 Temp_Auth 檔案刪除。");
}

function isOpenAICompatibleModel(modelName) {
    const lower = String(modelName).toLowerCase();
    return lower.includes('/') || lower.startsWith('llama') || lower.startsWith('mixtral') || lower.startsWith('nemotron') || lower.startsWith('deepseek');
}

function convertGoogleToolsToOpenAI(googleTools) {
    if (!Array.isArray(googleTools)) return [];
    const openAiTools = [];
    
    function lowercaseTypes(schema) {
        if (!schema) return schema;
        const newSchema = { ...schema };
        if (typeof newSchema.type === 'string') {
            newSchema.type = newSchema.type.toLowerCase();
        }
        if (newSchema.properties) {
            const newProps = {};
            for (const [k, v] of Object.entries(newSchema.properties)) {
                newProps[k] = lowercaseTypes(v);
            }
            newSchema.properties = newProps;
        }
        if (newSchema.items) {
            newSchema.items = lowercaseTypes(newSchema.items);
        }
        return newSchema;
    }

    googleTools.forEach(toolBag => {
        if (toolBag.functionDeclarations && Array.isArray(toolBag.functionDeclarations)) {
            toolBag.functionDeclarations.forEach(decl => {
                openAiTools.push({
                    type: "function",
                    function: {
                        name: decl.name,
                        description: decl.description,
                        parameters: lowercaseTypes(decl.parameters)
                    }
                });
            });
        }
    });
    return openAiTools;
}

function convertHistoryToOpenAI(history, systemInstruction, prompt, isFunctionResponse) {
    const messages = [];
    
    if (systemInstruction) {
        messages.push({ role: "system", content: systemInstruction });
    }
    
    function getTextFromParts(parts) {
        if (!parts) return "";
        return parts.filter(p => p.text).map(p => p.text).join("\n").trim();
    }
    
    history.forEach(turn => {
        const role = (turn.role === 'model' || turn.role === 'assistant') ? 'assistant' : 'user';
        
        if (turn.parts && Array.isArray(turn.parts)) {
            const functionCalls = turn.parts.filter(p => p.functionCall);
            const functionResponses = turn.parts.filter(p => p.functionResponse);
            
            if (functionCalls.length > 0) {
                const textContent = getTextFromParts(turn.parts);
                messages.push({
                    role: "assistant",
                    content: textContent || null,
                    tool_calls: functionCalls.map(fc => ({
                        id: fc.functionCall.id || ("call_" + Math.random().toString(36).substring(2, 10)),
                        type: "function",
                        function: {
                            name: fc.functionCall.name,
                            arguments: JSON.stringify(fc.functionCall.args || {})
                        }
                    }))
                });
            } else if (functionResponses.length > 0) {
                functionResponses.forEach(fr => {
                    messages.push({
                        role: "tool",
                        tool_call_id: fr.functionResponse.id || "call_unknown",
                        name: fr.functionResponse.name,
                        content: JSON.stringify(fr.functionResponse.response || {})
                    });
                });
            } else {
                const content = getTextFromParts(turn.parts) || turn.content || "";
                if (content) messages.push({ role: role, content: content });
            }
        } else {
            const content = turn.content || turn.text || "";
            if (content) messages.push({ role: role, content: content });
        }
    });
    
    if (!isFunctionResponse && prompt) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'user') {
            lastMsg.content = (lastMsg.content ? lastMsg.content + "\n" : "") + prompt;
        } else {
            messages.push({ role: "user", content: prompt });
        }
    }
    
    return messages;
}

function translateOpenAiResponseToGemini(openAiRes) {
    const choice = openAiRes.choices && openAiRes.choices[0];
    if (!choice) {
        throw new Error("NVIDIA API returned no choices: " + JSON.stringify(openAiRes));
    }
    
    const message = choice.message;
    const parts = [];
    
    if (message.content) {
        parts.push({ text: message.content });
    }
    
    if (message.tool_calls && Array.isArray(message.tool_calls)) {
        message.tool_calls.forEach(tc => {
            let parsedArgs = {};
            try {
                parsedArgs = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
            } catch(e) {
                console.warn("Failed to parse tool arguments from OpenAI response", e);
            }
            parts.push({
                functionCall: {
                    name: tc.function.name,
                    args: parsedArgs,
                    id: tc.id
                }
            });
        });
    }
    
    return {
        candidates: [
            {
                content: {
                    parts: parts
                },
                finishReason: choice.finish_reason === 'stop' ? 'STOP' : (choice.finish_reason === 'tool_calls' ? 'STOP' : choice.finish_reason)
            }
        ]
    };
}

function callOpenAICompatibleAPI_Raw({ prompt, model, apiKey, systemInstruction, history = [], tools = [], imageData = null, isFunctionResponse = false }, configData) {
    let targetUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
    let targetKey = configData ? configData.NVIDIA_API_KEY : PropertiesService.getScriptProperties().getProperty('NVIDIA_API_KEY');
    
    const hasOpenRouterKey = configData ? configData.OPENROUTER_API_KEY : PropertiesService.getScriptProperties().getProperty('OPENROUTER_API_KEY');
    const hasDeepSeekKey = configData ? configData.DEEPSEEK_API_KEY : PropertiesService.getScriptProperties().getProperty('DEEPSEEK_API_KEY');
    const hasGroqKey = configData ? configData.GROQ_API_KEY : PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
    
    if (hasDeepSeekKey && model.startsWith('deepseek')) {
        targetUrl = "https://api.deepseek.com/chat/completions";
        targetKey = hasDeepSeekKey;
    } else if (hasOpenRouterKey && model.includes('/')) {
        targetUrl = "https://openrouter.ai/api/v1/chat/completions";
        targetKey = hasOpenRouterKey;
    } else if (hasGroqKey && (model.startsWith('llama') || model.startsWith('mixtral') || model.startsWith('gemma'))) {
        targetUrl = "https://api.groq.com/openai/v1/chat/completions";
        targetKey = hasGroqKey;
    }

    if (!targetKey) {
        throw new Error("找不到對應的 API KEY。請在 setting 工作表新增 NVIDIA_API_KEY, OPENROUTER_API_KEY, DEEPSEEK_API_KEY, 或 GROQ_API_KEY。");
    }
    
    const messages = convertHistoryToOpenAI(history, systemInstruction, prompt, isFunctionResponse);
    const openAiTools = convertGoogleToolsToOpenAI(tools);
    
    const payload = {
        model: model,
        messages: messages,
        temperature: 0.2,
        top_p: 0.7,
        max_tokens: 4096
    };
    
    if (openAiTools.length > 0) {
        payload.tools = openAiTools;
    }
    
    const options = {
        method: "post",
        contentType: "application/json",
        headers: {
            "Authorization": "Bearer " + targetKey
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(targetUrl, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (statusCode !== 200) {
        const providerName = targetUrl.includes("deepseek") ? "DeepSeek" : targetUrl.includes("groq") ? "Groq" : targetUrl.includes("openrouter") ? "OpenRouter" : "NVIDIA NIM";
        throw new Error(`${providerName} API 錯誤 (${statusCode}): ${responseText}`);
    }
    
    const openAiRes = JSON.parse(responseText);
    return translateOpenAiResponseToGemini(openAiRes);
}