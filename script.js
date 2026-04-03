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
let lastUpdateId = 0; // Đánh dấu tin nhắn Telegram đã đọc

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

// Tự động khôi phục đơn hàng đang dở dang khi F5 lại trang
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

// Tạo mã đơn ngẫu nhiên
function generateOrderID() {
    return 'GA' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Hàm gửi thông báo và lưu lại ID tin nhắn
async function sendTelegramNotification(orderData) {
    const message = `🔔 <b>CÓ ĐƠN NẠP MỚI</b> 🔔\n` +
                    `- Mã đơn: <b>${orderData.orderId}</b>\n` +
                    `- Game: ${orderData.game}\n` +
                    `🎯 <b>UID:</b> <code>${orderData.uid}</code> 🎯\n` +
                    `- Gói nạp: ${orderData.original.toLocaleString('vi-VN')}đ\n` +
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
                    inline_keyboard: [
                        [ { text: "✅ DUYỆT ĐƠN NÀY", callback_data: `DUYET_${orderData.orderId}` } ]
                    ]
                }
            })
        });
        
        const json = await response.json();
        // Nếu gửi thành công, lưu lại message_id vào đơn hàng để sau này xử lý xoá/sửa
        if (json.ok) {
            orderData.messageId = json.result.message_id;
            localStorage.setItem('currentOrder', JSON.stringify(orderData));
        }
    } catch (error) {
        console.log("Lỗi gửi thông báo Telegram");
    }
}

// Lắng nghe thao tác duyệt đơn từ Admin
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
                            
                            // 1. Phản hồi để tắt vòng xoay của nút
                            fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ 
                                    callback_query_id: update.callback_query.id, 
                                    text: "Đã duyệt đơn! Khách đã nhận được hàng." 
                                })
                            });

                            // 2. CHỈNH SỬA TIN NHẮN (Bỏ nút bấm đi và báo đã xử lý xong)
                            const messageId = update.callback_query.message.message_id;
                            const newText = `✅ <b>ĐƠN HÀNG ĐÃ XỬ LÝ XONG</b> ✅\n` +
                                            `- Mã đơn: <b>${orderData.orderId}</b>\n` +
                                            `- Game: ${orderData.game}\n` +
                                            `- UID: <code>${orderData.uid}</code>\n` +
                                            `- Gói nạp: ${orderData.original.toLocaleString('vi-VN')}đ`;

                            fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ 
                                    chat_id: TELEGRAM_CHAT_ID,
                                    message_id: messageId,
                                    text: newText,
                                    parse_mode: 'HTML'
                                })
                            });

                            // 3. Cập nhật Web cho khách sang Nạp Thành Công
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

// Xử lý tạo đơn hàng
function createPayment() {
    const game = document.getElementById('game').value;
    const uid = document.getElementById('uid').value.trim();
    
    // Điều kiện nhập ID
    if (!uid) return alert("Vui lòng nhập UID!");
    if (uid.length < 5) return alert("UID không hợp lệ (quá ngắn)!");
    if (selectedOriginal === 0) return alert("Vui lòng chọn mệnh giá!");

    document.getElementById('btn-create').innerText = "Đang xử lý...";
    document.getElementById('btn-create').disabled = true;

    const orderId = generateOrderID(); 
    currentOrderId = orderId;
    const qrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact.png?amount=${selectedDiscounted}&addInfo=${orderId}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;

    const expireAt = Date.now() + (30 * 60 * 1000); // Đếm ngược 30 phút
    const createdAt = new Date().toLocaleString('vi-VN'); 

    const orderData = { orderId, game, uid, original: selectedOriginal, discounted: selectedDiscounted, qrUrl, expireAt, createdAt };
    
    // Lưu vào bộ nhớ tạm
    localStorage.setItem('currentOrder', JSON.stringify(orderData));

    // Thực thi các hàm
    sendTelegramNotification(orderData);
    showResultArea(orderData);
    startTimer(30 * 60, expireAt); 
    listenToAdmin(orderData); 
}

// Hiển thị phần thanh toán (Mã QR)
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

// Bắt đầu đếm ngược thời gian
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

// Chuyển sang màn hình nạp thành công
function showSuccessArea(data) {
    document.getElementById('result-area').style.display = 'none';
    document.getElementById('success-area').style.display = 'block';
    
    document.getElementById('success-order-id').innerText = data.orderId;
    document.getElementById('success-game').innerText = data.game;
    document.getElementById('success-package').innerText = data.original.toLocaleString('vi-VN') + "đ";
    document.getElementById('success-uid').innerText = data.uid;
    
    localStorage.removeItem('currentOrder'); 
}

// Chức năng tải QR về máy
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

// Khách hủy đơn -> Xóa tin nhắn Telegram & Reset web
function cancelOrder() {
    clearInterval(adminCheckInterval);
    clearInterval(countdownInterval);
    
    const savedOrder = localStorage.getItem('currentOrder');
    if (savedOrder) {
        const orderData = JSON.parse(savedOrder);
        
        // Nếu có ID tin nhắn, ra lệnh xoá trên Telegram
        if (orderData.messageId) {
            fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    chat_id: TELEGRAM_CHAT_ID,
                    message_id: orderData.messageId
                })
            }).catch(e => console.log(e));
        }
    }
    
    localStorage.removeItem('currentOrder');
    location.reload();
}

// Helper: Hàm sao chép văn bản
function copyText(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert("Đã sao chép: " + text);
    });
}
