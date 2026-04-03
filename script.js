// --- CẤU HÌNH NGÂN HÀNG ---
const BANK_ID = "VCB"; 
const ACCOUNT_NO = "9794467190"; 
const ACCOUNT_NAME = "PHAM DOAN ANH KHOA";     

// --- CẤU HÌNH BOT TELEGRAM ---
const TELEGRAM_BOT_TOKEN = "8120110998:AAGTA6O8j7LRjNdmbKv-AcwShaT_njRdWqw"; 
const TELEGRAM_CHAT_ID = "6683190361";

const denominations = [20000, 50000, 100000, 200000, 500000, 1000000];
let selectedOriginal = 0; 
let selectedDiscounted = 0;
let countdownInterval;
let adminCheckInterval; 
let lastUpdateId = 0;

// Khởi tạo các nút chọn mệnh giá
const priceContainer = document.getElementById('price-container');
if (priceContainer) {
    denominations.forEach(amount => {
        const discounted = amount * 0.94;
        const btn = document.createElement('div');
        btn.className = 'price-btn';
        btn.innerHTML = `<span class="original">${amount.toLocaleString('vi-VN')}đ</span><span class="discounted">${discounted.toLocaleString('vi-VN')}đ</span>`;
        btn.onclick = function() {
            document.querySelectorAll('.price-btn').forEach(el => el.classList.remove('active'));
            this.classList.add('active');
            selectedOriginal = amount; 
            selectedDiscounted = discounted;
        };
        priceContainer.appendChild(btn);
    });
}

// Khôi phục đơn hàng khi F5
window.onload = function() {
    const savedOrder = localStorage.getItem('currentOrder');
    if (savedOrder) {
        const orderData = JSON.parse(savedOrder);
        const timeRemaining = Math.floor((orderData.expireAt - Date.now()) / 1000);
        
        if (timeRemaining > 0) {
            showResultArea(orderData);
            startTimer(timeRemaining, orderData.expireAt, orderData); // Truyền thêm orderData
            listenToAdmin(orderData); 
        } else {
            // Nếu đã quá 5p khi vừa mở lại trang, tiến hành xóa tin nhắn cũ (nếu có)
            deleteTelegramMessage(orderData.messageId);
            localStorage.removeItem('currentOrder');
        }
    }
};

function generateOrderID() {
    return 'GA' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Gửi tin nhắn Telegram
async function sendTelegramNotification(orderData) {
    const message = `🔔 <b>CÓ ĐƠN NẠP MỚI (Hết hạn sau 5p)</b> 🔔\n` +
                    `- Mã đơn: <b>${orderData.orderId}</b>\n` +
                    `- Game: ${orderData.game}\n` +
                    `🎯 <b>UID:</b> <code>${orderData.uid}</code> 🎯\n` +
                    `- Cần thanh toán: <b>${orderData.discounted.toLocaleString('vi-VN')}đ</b>`;

    try {
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[ { text: "✅ DUYỆT ĐƠN NÀY", callback_data: `DUYET_${orderData.orderId}` } ]]
                }
            })
        });
        const json = await response.json();
        if (json.ok) {
            orderData.messageId = json.result.message_id;
            localStorage.setItem('currentOrder', JSON.stringify(orderData));
        }
    } catch (e) { console.log("Lỗi gửi tin nhắn"); }
}

// Hàm hỗ trợ xóa tin nhắn Telegram
function deleteTelegramMessage(messageId) {
    if (!messageId) return;
    fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, message_id: messageId })
    }).catch(e => console.log("Không thể xóa tin nhắn:", e));
}

// Bắt đầu đếm ngược 5 PHÚT
function startTimer(duration, expireAt, orderData) {
    clearInterval(countdownInterval);
    countdownInterval = setInterval(function () {
        let timer = Math.floor((expireAt - Date.now()) / 1000);
        
        if (timer <= 0) {
            clearInterval(countdownInterval);
            clearInterval(adminCheckInterval);
            
            // TỰ ĐỘNG XÓA TIN NHẮN KHI HẾT 5 PHÚT
            deleteTelegramMessage(orderData.messageId);
            
            localStorage.removeItem('currentOrder');
            document.getElementById('active-order').style.display = 'none';
            document.getElementById('timer-display').style.display = 'none';
            document.getElementById('expired-msg').style.display = 'block';
            return;
        }

        let minutes = parseInt(timer / 60, 10);
        let seconds = parseInt(timer % 60, 10);
        document.getElementById('countdown').textContent = (minutes < 10 ? "0" + minutes : minutes) + ":" + (seconds < 10 ? "0" + seconds : seconds);
    }, 1000);
}

function listenToAdmin(orderData) {
    clearInterval(adminCheckInterval);
    adminCheckInterval = setInterval(async () => {
        try {
            const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId}`);
            const json = await response.json();
            if (json.ok && json.result.length > 0) {
                for (let update of json.result) {
                    lastUpdateId = update.update_id + 1;
                    if (update.callback_query && update.callback_query.data === `DUYET_${orderData.orderId}`) {
                        // Phản hồi tắt loading nút
                        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ callback_query_id: update.callback_query.id, text: "Đã duyệt đơn!" })
                        });

                        // Sửa tin nhắn thành "Đã xử lý"
                        const newText = `✅ <b>ĐƠN HÀNG ĐÃ XỬ LÝ XONG</b> ✅\n- Mã đơn: ${orderData.orderId}\n- UID: ${orderData.uid}`;
                        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, message_id: update.callback_query.message.message_id, text: newText, parse_mode: 'HTML' })
                        });

                        clearInterval(adminCheckInterval);
                        clearInterval(countdownInterval);
                        showSuccessArea(orderData);
                        return;
                    }
                }
            }
        } catch (e) {}
    }, 3000);
}

function createPayment() {
    const game = document.getElementById('game').value;
    const uid = document.getElementById('uid').value.trim();
    if (!uid || selectedOriginal === 0) return alert("Vui lòng điền đủ thông tin!");

    const orderId = generateOrderID();
    const qrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact.png?amount=${selectedDiscounted}&addInfo=${orderId}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;
    const expireAt = Date.now() + (5 * 60 * 1000); // Đổi thành 5 phút

    const orderData = { orderId, game, uid, original: selectedOriginal, discounted: selectedDiscounted, qrUrl, expireAt };
    
    sendTelegramNotification(orderData);
    showResultArea(orderData);
    startTimer(5 * 60, expireAt, orderData); 
    listenToAdmin(orderData);
}

function showResultArea(data) {
    document.getElementById('out-order-id').innerText = data.orderId;
    document.getElementById('bank-amount').innerText = data.discounted.toLocaleString('vi-VN') + "đ";
    document.getElementById('bank-content').innerText = data.orderId;
    document.getElementById('qr-image').src = data.qrUrl;
    document.getElementById('input-area').style.display = 'none';
    document.getElementById('result-area').style.display = 'block';
}

function showSuccessArea(data) {
    document.getElementById('result-area').style.display = 'none';
    document.getElementById('success-area').style.display = 'block';
    document.getElementById('success-order-id').innerText = data.orderId;
    localStorage.removeItem('currentOrder');
}

function cancelOrder() {
    const savedOrder = localStorage.getItem('currentOrder');
    if (savedOrder) {
        const orderData = JSON.parse(savedOrder);
        deleteTelegramMessage(orderData.messageId);
    }
    clearInterval(adminCheckInterval);
    clearInterval(countdownInterval);
    localStorage.removeItem('currentOrder');
    location.reload();
}

function copyText(text) {
    navigator.clipboard.writeText(text).then(() => alert("Đã sao chép: " + text));
}
    
