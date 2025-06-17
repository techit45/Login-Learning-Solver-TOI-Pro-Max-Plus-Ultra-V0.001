// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let selectedFile = null;
let currentPythonCode = '';
let currentCppCode = '';

document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const processBtn = document.getElementById('processBtn');
    const apiKeyLockBtn = document.getElementById('apiKeyLockBtn');
    const sendToAiBtn = document.getElementById('sendToAiBtn');

    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', handleDragOver);
    uploadZone.addEventListener('dragleave', handleDragLeave);
    uploadZone.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);
    
    processBtn.addEventListener('click', performOcr);
    sendToAiBtn.addEventListener('click', getAiSolution);
    apiKeyLockBtn.addEventListener('click', toggleApiLock);
}

function toggleApiLock() {
    const apiKeyInput = document.getElementById('geminiApiKey');
    const lockBtn = document.getElementById('apiKeyLockBtn');

    if (apiKeyInput.readOnly) {
        const password = prompt("โปรดใส่รหัสผ่านเพื่อปลดล็อก:");
        if (password === '0000') {
            apiKeyInput.readOnly = false;
            apiKeyInput.type = 'text';
            lockBtn.textContent = '🔓';
            alert('ปลดล็อกสำเร็จ! คุณสามารถแก้ไข API Key ได้แล้ว');
        } else if (password !== null) {
            alert('รหัสผ่านไม่ถูกต้อง!');
        }
    } else {
        apiKeyInput.readOnly = true;
        apiKeyInput.type = 'password';
        lockBtn.textContent = '🔒';
    }
}

function handleDragOver(e) {
    e.preventDefault();
    document.getElementById('uploadZone').classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    document.getElementById('uploadZone').classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    document.getElementById('uploadZone').classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

function handleFile(file) {
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
        showError('กรุณาเลือกไฟล์ PDF, PNG, หรือ JPG เท่านั้น');
        return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10 MB limit
        showError('ขนาดไฟล์ต้องไม่เกิน 10MB');
        return;
    }

    selectedFile = file;
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);
    document.getElementById('fileInfo').style.display = 'block';
    document.getElementById('processBtn').disabled = false;
    document.getElementById('sendToAiBtn').disabled = true;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function performOcr() {
    if (!selectedFile) return;

    const geminiKey = document.getElementById('geminiApiKey').value.trim();
    if (!geminiKey) {
        showError('กรุณาใส่ Gemini API Key');
        return;
    }

    const processBtn = document.getElementById('processBtn');
    const sendToAiBtn = document.getElementById('sendToAiBtn');

    try {
        processBtn.disabled = true;
        sendToAiBtn.disabled = true;
        showProgress(0);
        updateStatus('กำลังแปลงไฟล์...', true);

        showProgress(20);
        const imageData = await fileToBase64(selectedFile);
        
        updateStatus('กำลังทำ OCR...', true);
        showProgress(50);
        const ocrResult = await callGeminiVision(imageData, geminiKey);
        
        updateStatus('OCR สำเร็จ', false);
        showProgress(100);
        displayOCRResult(ocrResult);
        setTimeout(hideProgress, 500);

    } catch (error) {
        console.error('OCR Error:', error);
        showError('เกิดข้อผิดพลาดระหว่างทำ OCR: ' + error.message);
        updateStatus('เกิดข้อผิดพลาด', false);
        hideProgress();
    } finally {
        processBtn.disabled = false;
    }
}

async function getAiSolution() {
    const ocrText = document.getElementById('ocrContent').value.trim();
    if (!ocrText) {
         showError('ไม่มีข้อความจาก OCR ที่จะส่งให้ AI');
         return;
    }
    
    const geminiKey = document.getElementById('geminiApiKey').value.trim();
    if (!geminiKey) {
        showError('กรุณาใส่ Gemini API Key');
        return;
    }
    
    const sendToAiBtn = document.getElementById('sendToAiBtn');

    try {
        sendToAiBtn.disabled = true;
        updateStatus('AI กำลังวิเคราะห์...', true);
        document.getElementById('solutionContent').innerHTML = '<div class="loading"><div class="spinner"></div>กำลังสร้างผลลัพธ์...</div>';
        
        const prompt = buildCustomPrompt().replace('{PROBLEM_TEXT}', ocrText);
        const aiSolution = await callGeminiText(prompt, geminiKey);

        updateStatus('พร้อมใช้งาน', false);
        displayAISolution(aiSolution);
        extractAndDisplayCode(aiSolution);

    } catch (error) {
        console.error('AI Error:', error);
        showError('เกิดข้อผิดพลาดจาก AI: ' + error.message);
        updateStatus('เกิดข้อผิดพลาด', false);
        document.getElementById('solutionContent').innerHTML = `<div class="error">❌ ${error.message}</div>`;
    } finally {
        sendToAiBtn.disabled = false;
    }
}


function buildCustomPrompt() {
    const outputLanguage = document.getElementById('outputLanguage').value;
    const codeLanguage = document.getElementById('codeLanguage').value;
    const solutionDetail = document.getElementById('solutionDetail').value;

    let prompt = `คุณคือผู้เชี่ยวชาญการแก้โจทย์ปัญหาการเขียนโปรแกรม โดยเฉพาะโจทย์ในค่าย สอวน. คอมพิวเตอร์ (TOI).

โจทย์ที่ต้องแก้:
{PROBLEM_TEXT}

ข้อกำหนด:
`;

    if (outputLanguage === 'thai') {
        prompt += `🗣️ ภาษา: ตอบเป็นภาษาไทยทั้งหมด\n`;
    } else if (outputLanguage === 'english') {
        prompt += `🗣️ ภาษา: ตอบเป็นภาษาอังกฤษทั้งหมด\n`;
    } else {
        prompt += `🗣️ ภาษา: ใช้ภาษาไทยสำหรับคำอธิบาย และใช้ภาษาอังกฤษสำหรับคอมเมนต์ในโค้ด\n`;
    }

    if (codeLanguage === 'both') {
        prompt += `💻 ภาษาโปรแกรม: สร้างโค้ด C++ และ Python\n`;
    } else if (codeLanguage === 'cpp') {
        prompt += `💻 ภาษาโปรแกรม: สร้างโค้ด C++ เท่านั้น\n`;
    } else {
        prompt += `💻 ภาษาโปรแกรม: สร้างโค้ด Python เท่านั้น\n`;
    }

    if (solutionDetail === 'brief') {
        prompt += `📏 ระดับความละเอียด: สั้นและกระชับ\n`;
    } else if (solutionDetail === 'beginner') {
        prompt += `📏 ระดับความละเอียด: อธิบายอย่างละเอียดสำหรับผู้เริ่มต้น\n`;
    } else {
        prompt += `📏 ระดับความละเอียด: ครอบคลุมและละเอียดมาก\n`;
    }

    prompt += `
📋 รูปแบบการตอบ:
1.  **การวิเคราะห์โจทย์:** (Problem Analysis)
2.  **แนวคิดและอัลกอริทึม:** (Algorithm Explanation)
3.  **โค้ดโปรแกรม:** (Code Implementation - ใช้ \`\`\`cpp หรือ \`\`\`python)
4.  **คำอธิบายโค้ด:** (Code Explanation)
5.  **ความซับซ้อนเชิงเวลาและพื้นที่:** (Time/Space Complexity)

โปรดจัดรูปแบบคำตอบให้ชัดเจนและสวยงามพร้อมบล็อกโค้ดที่ถูกต้อง`;

    return prompt;
}

async function callGeminiVision(imageData, apiKey) {
    const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;
    const mimeType = imageData.includes('data:') ? imageData.split(';')[0].split(':')[1] : 'image/png';
    
    const promptText = "โปรดอ่านและดึงข้อความทั้งหมดจากรูปภาพนี้อย่างแม่นยำ โดยพยายามรักษาโครงสร้างและรูปแบบเดิมให้มากที่สุดเท่าที่จะทำได้";

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: promptText },
                    { inline_data: { mime_type: mimeType, data: base64Data } }
                ]
            }]
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Error: ${response.status} - ${errorData.error?.message || response.statusText}`);
    }

    const result = await response.json();
    return result.candidates[0].content.parts[0].text;
}

async function callGeminiText(prompt, apiKey) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    if (!response.ok) {
         const errorData = await response.json();
        throw new Error(`API Error: ${response.status} - ${errorData.error?.message || response.statusText}`);
    }

    const result = await response.json();
    return result.candidates[0].content.parts[0].text;
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function displayOCRResult(text) {
    const ocrTextArea = document.getElementById('ocrContent');
    ocrTextArea.value = text;
    document.getElementById('sendToAiBtn').disabled = false;
}

function displayAISolution(solution) {
    // Replace markdown bold/italic and newlines with HTML tags
    const formatted = solution
        .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>') // Bold Italic
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')       // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>')             // Italic
        .replace(/`([^`]+)`/g, '<code>$1</code>')         // Inline code
        .replace(/\n/g, '<br>');
    
    // Remove code blocks from the main solution display area
    const withoutCode = formatted.replace(/<br>```[\s\S]*?```<br>/g, '<br><div style="background:#eef2ff; padding:8px; border-radius:4px; margin:10px 0; color:#4338ca;">[โค้ดแสดงในช่องด้านล่าง]</div><br>');
    
    document.getElementById('solutionContent').innerHTML = `<div class="solution-text">${withoutCode}</div>`;
}


function extractAndDisplayCode(solution) {
    // Extract Python code
    const pythonMatch = solution.match(/```python\n([\s\S]*?)```/);
    const pythonCodeEl = document.getElementById('pythonCode');
    if (pythonMatch && pythonMatch[1].trim()) {
        currentPythonCode = pythonMatch[1].trim();
        pythonCodeEl.textContent = currentPythonCode;
    } else {
         currentPythonCode = '';
         pythonCodeEl.innerHTML = '<div style="color: #94a3b8; text-align: center; padding: 20px;">ไม่พบโค้ด Python ในผลลัพธ์</div>';
    }

    // Extract C++ code
    const cppMatch = solution.match(/```cpp\n([\s\S]*?)```/) || solution.match(/```c\+\+\n([\s\S]*?)```/);
    const cppCodeEl = document.getElementById('cppCode');
    if (cppMatch && cppMatch[1].trim()) {
        currentCppCode = cppMatch[1].trim();
        cppCodeEl.textContent = currentCppCode;
    } else {
        currentCppCode = '';
        cppCodeEl.innerHTML = '<div style="color: #94a3b8; text-align: center; padding: 20px;">ไม่พบโค้ด C++ ในผลลัพธ์</div>';
    }
}


function copyCode(elementId, btn) {
    const element = document.getElementById(elementId);
    const text = element.textContent;

    if (!text || text.includes('ไม่พบโค้ด')) {
        alert("ไม่มีโค้ดให้คัดลอก");
        return;
    }
    
    navigator.clipboard.writeText(text).then(() => {
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ คัดลอกแล้ว!';
        btn.style.background = '#10b981';
        
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = ''; // Revert to original class style
        }, 2000);
    });
}

async function refreshCode(language, btn) {
    const originalText = btn.innerHTML;
    btn.innerHTML = '🔄 กำลังสร้าง...';
    btn.disabled = true;

    try {
        const geminiKey = document.getElementById('geminiApiKey').value.trim();
        if (!geminiKey) {
            showError('กรุณาใส่ Gemini API Key');
            return;
        }

        const sourceCode = language === 'python' ? currentCppCode : currentPythonCode;
        const sourceLang = language === 'python' ? 'C++' : 'Python';
        const targetLang = language === 'python' ? 'Python' : 'C++';

        if (!sourceCode) {
            showError(`ไม่มีโค้ด ${sourceLang} สำหรับใช้ในการแปลง`);
            return;
        }

        const prompt = `แปลงโค้ด ${sourceLang} ต่อไปนี้ให้เป็นภาษา ${targetLang} โดยรักษาตรรกะและฟังก์ชันการทำงานเดิมไว้ทั้งหมด:

\`\`\`${sourceLang.toLowerCase()}
${sourceCode}
\`\`\`

โปรดตอบกลับมาเป็นโค้ด ${targetLang} ในรูปแบบบล็อกโค้ดเท่านั้น โดยไม่ต้องมีคำอธิบายใดๆ เพิ่มเติม`;

        const newCodeText = await callGeminiText(prompt, geminiKey);
        
        let newCode = newCodeText;
        const codeMatch = newCode.match(/```[\w\W]*?\n([\s\S]*?)```/);
        if (codeMatch) {
            newCode = codeMatch[1].trim();
        }

        if (language === 'python') {
            currentPythonCode = newCode;
            document.getElementById('pythonCode').textContent = newCode;
        } else {
            currentCppCode = newCode;
            document.getElementById('cppCode').textContent = newCode;
        }

        btn.innerHTML = '✅ สร้างสำเร็จ!';
        btn.style.background = '#10b981';

    } catch (error) {
        console.error('Refresh code error:', error);
        btn.innerHTML = '❌ ผิดพลาด';
        btn.style.background = '#ef4444';
    } finally {
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '';
            btn.disabled = false;
        }, 2000);
    }
}

function showCppInfo() {
    alert(`💡 วิธีรันโค้ด C++:

1. คัดลอกโค้ด C++
2. เปิดโปรแกรม IDE เช่น:
   • Dev-C++
   • Code::Blocks
   • Visual Studio Code (ต้องติดตั้งส่วนเสริม C++)
   • หรือใช้เว็บคอมไพเลอร์ออนไลน์
3. วางโค้ด แล้วคอมไพล์และรัน
4. ใส่ Input ตามที่โจทย์กำหนด

🔗 เว็บคอมไพเลอร์ C++ ออนไลน์ที่แนะนำ:
• https://onlinegdb.com/online_c++_compiler
• https://www.programiz.com/cpp-programming/online-compiler/`);
}

function updateStatus(message, isProcessing) {
    const statusText = document.getElementById('statusText');
    const statusDot = document.querySelector('.status-dot');
    statusText.textContent = message;
    if (isProcessing) {
        statusDot.style.background = '#f59e0b'; // Yellow for processing
    } else {
        statusDot.style.background = '#10b981'; // Green for ready
    }
}

function showProgress(percentage) {
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    progressBar.style.display = 'block';
    progressFill.style.width = percentage + '%';
}

function hideProgress() {
    document.getElementById('progressBar').style.display = 'none';
}

function showError(message) {
    alert("เกิดข้อผิดพลาด: " + message);
}
