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
let currentOrderId = "";
let lastUpdateId = 0; 

const priceContainer = document.getElementById('price-container');
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

window.onload = function() {
    const savedOrder = localStorage.getItem('currentOrder');
    if (savedOrder) {
        const orderData = JSON.parse(savedOrder);
        const timeRemaining = Math.floor((orderData.expireAt - Date.now()) / 1000);
        
        if (timeRemaining > 0) {
            showResultArea(orderData);
            startTimer(timeRemaining, orderData.expireAt);
            listenToAdmin(orderData); 
        } else {
            localStorage.removeItem('currentOrder');
        }
    }
};

function generateOrderID() {
    return 'GA' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Hàm gửi thông báo CÓ KÈM NÚT BẤM
function sendTelegramNotification(orderData) {
    const message = `🔔 <b>CÓ ĐƠN NẠP MỚI</b> 🔔\n` +
                    `- Mã đơn: <b>${orderData.orderId}</b>\n` +
                    `- Game: ${orderData.game}\n` +
                    `🎯 <b>UID:</b> <code>${orderData.uid}</code> 🎯\n` +
                    `- Gói nạp: ${orderData.original.toLocaleString('vi-VN')}đ\n` +
                    `- Cần thanh toán: <b>${orderData.discounted.toLocaleString('vi-VN')}đ</b>`;

    fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "✅ DUYỆT ĐƠN NÀY", callback_data: `DUYET_${orderData.orderId}` }
                    ]
                ]
            }
        })
    });
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
                    
                    if (update.callback_query && update.callback_query.data) {
                        if (update.callback_query.data === `DUYET_${orderData.orderId}`) {
                            
                            fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ 
                                    callback_query_id: update.callback_query.id, 
                                    text: "Đã duyệt đơn thành công! Web của khách đã chuyển trạng thái." 
                                })
                            });

                            clearInterval(adminCheckInterval);
                            clearInterval(countdownInterval);
                            showSuccessArea(orderData);
                            return;
                        }
                    }

                    if (update.message && update.message.text) {
                        const text = update.message.text.toUpperCase().trim();
                        if (text === `DUYET ${orderData.orderId.toUpperCase()}`) {
                            clearInterval(adminCheckInterval);
                            clearInterval(countdownInterval);
                            showSuccessArea(orderData);
                            return;
                        }
                    }
                }
            }
        } catch (error) {
            console.log("Đang chờ admin...");
        }
    }, 3000); 
}

function createPayment() {
    const game = document.getElementById('game').value;
    const uid = document.getElementById('uid').value.trim();
    
    if (!uid) return alert("Vui lòng nhập UID!");
    if (uid.length < 5) return alert("UID không hợp lệ (quá ngắn)!");
    if (selectedOriginal === 0) return alert("Vui lòng chọn mệnh giá!");

    document.getElementById('btn-create').innerText = "Đang xử lý...";
    document.getElementById('btn-create').disabled = true;

    const orderId = generateOrderID(); 
    currentOrderId = orderId;
    const qrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact.png?amount=${selectedDiscounted}&addInfo=${orderId}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;

    const expireAt = Date.now() + (30 * 60 * 1000); 
    const createdAt = new Date().toLocaleString('vi-VN'); 

    const orderData = { orderId, game, uid, original: selectedOriginal, discounted: selectedDiscounted, qrUrl, expireAt, createdAt };
    
    localStorage.setItem('currentOrder', JSON.stringify(orderData));

    sendTelegramNotification(orderData);
    showResultArea(orderData);
    startTimer(30 * 60, expireAt); 
    listenToAdmin(orderData); 
}

function showResultArea(data) {
    document.getElementById('out-order-id').innerText = data.orderId;
    document.getElementById('out-game').innerText = data.game;
    document.getElementById('out-uid').innerText = data.uid;
    document.getElementById('out-original').innerText = data.original.toLocaleString('vi-VN') + "đ";
    document.getElementById('out-discounted').innerText = data.discounted.toLocaleString('vi-VN') + "đ";
    
    document.getElementById('bank-amount').innerText = data.discounted.toLocaleString('vi-VN') + "đ";
    document.getElementById('bank-content').innerText = data.orderId;
    document.getElementById('qr-image').src = data.qrUrl;

    document.getElementById('copy-amount-btn').onclick = () => copyText(data.discounted.toString());
    document.getElementById('copy-content-btn').onclick = () => copyText(data.orderId);

    document.getElementById('input-area').style.display = 'none';
    document.getElementById('result-area').style.display = 'block';
}

function startTimer(durationInSeconds, expireAt) {
    clearInterval(countdownInterval);
    countdownInterval = setInterval(function () {
        let timer = Math.floor((expireAt - Date.now()) / 1000);
        
        if (timer < 0) {
            clearInterval(countdownInterval);
            clearInterval(adminCheckInterval); 
            localStorage.removeItem('currentOrder');
            document.getElementById('active-order').style.display = 'none';
            document.getElementById('timer-display').style.display = 'none';
            document.getElementById('expired-msg').style.display = 'block';
            return;
        }

        let minutes = parseInt(timer / 60, 10);
        let seconds = parseInt(timer % 60, 10);
        minutes = minutes < 10 ? "0" + minutes : minutes;
        seconds = seconds < 10 ? "0" + seconds : seconds;
        document.getElementById('countdown').textContent = minutes + ":" + seconds;
    }, 1000);
}

function showSuccessArea(data) {
    document.getElementById('result-area').style.display = 'none';
    document.getElementById('success-area').style.display = 'block';
    
    document.getElementById('success-order-id').innerText = data.orderId;
    document.getElementById('success-game').innerText = data.game;
    document.getElementById('success-package').innerText = data.original.toLocaleString('vi-VN') + "đ";
    document.getElementById('success-uid').innerText = data.uid;
    
    localStorage.removeItem('currentOrder'); 
}

async function downloadQR() {
    const imgUrl = document.getElementById('qr-image').src;
    const orderId = document.getElementById('out-order-id').innerText;
    try {
        const response = await fetch(imgUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `QR_${orderId}.png`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        alert("Đã tải mã QR về máy!");
    } catch (e) {
        window.open(imgUrl, '_blank');
    }
}

function cancelOrder() {
    clearInterval(adminCheckInterval);
    localStorage.removeItem('currentOrder');
    location.reload();
}

function copyText(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert("Đã sao chép: " + text);
    });
}

