
const ago = (ms) => new Date(Date.now() - ms)
const minsAgo = (m) => ago(m * 60000)
const hoursAgo = (h) => ago(h * 3600000)
const daysAgo = (d) => ago(d * 86400000)
const fmtVND = (n) => n.toLocaleString('vi-VN') + 'đ'

export const mockLot = {
  lot_id: 'lot-001',
  name: 'Bãi Xe Thông Minh – ĐH Hàng Hải Việt Nam',
  address: '484 Lạch Tray, Đổng Quốc Bình, Lê Chân, Hải Phòng',
  total_capacity: 150,
  current_occupancy: 94,
  is_active: true,
}

export const mockUsers = [
  { user_id:'u-001', full_name:'Nguyễn Văn An',    phone_number:'0901234567', is_active:true,  is_verified:true,  wallet_balance:125000, low_balance_threshold:50000, total_vehicles:2, total_sessions:47, created_at:daysAgo(210) },
  { user_id:'u-002', full_name:'Trần Thị Bích',     phone_number:'0912345678', is_active:true,  is_verified:true,  wallet_balance:320000, low_balance_threshold:50000, total_vehicles:1, total_sessions:32, created_at:daysAgo(175) },
  { user_id:'u-003', full_name:'Lê Minh Cường',     phone_number:'0923456789', is_active:true,  is_verified:true,  wallet_balance:15000,  low_balance_threshold:50000, total_vehicles:2, total_sessions:61, created_at:daysAgo(300) },
  { user_id:'u-004', full_name:'Phạm Thị Dung',     phone_number:'0934567890', is_active:true,  is_verified:true,  wallet_balance:450000, low_balance_threshold:50000, total_vehicles:1, total_sessions:28, created_at:daysAgo(95)  },
  { user_id:'u-005', full_name:'Hoàng Văn Em',       phone_number:'0945678901', is_active:false, is_verified:true,  wallet_balance:0,      low_balance_threshold:50000, total_vehicles:1, total_sessions:9,  created_at:daysAgo(60)  },
  { user_id:'u-006', full_name:'Ngô Thị Phương',    phone_number:'0956789012', is_active:true,  is_verified:true,  wallet_balance:80000,  low_balance_threshold:50000, total_vehicles:3, total_sessions:54, created_at:daysAgo(365) },
  { user_id:'u-007', full_name:'Đặng Văn Giang',    phone_number:'0967890123', is_active:true,  is_verified:false, wallet_balance:200000, low_balance_threshold:50000, total_vehicles:1, total_sessions:12, created_at:daysAgo(30)  },
  { user_id:'u-008', full_name:'Lý Thị Hoa',        phone_number:'0978901234', is_active:true,  is_verified:true,  wallet_balance:55000,  low_balance_threshold:50000, total_vehicles:2, total_sessions:38, created_at:daysAgo(145) },
  { user_id:'u-009', full_name:'Vũ Quốc Khánh',     phone_number:'0989012345', is_active:true,  is_verified:true,  wallet_balance:730000, low_balance_threshold:50000, total_vehicles:1, total_sessions:22, created_at:daysAgo(80)  },
  { user_id:'u-010', full_name:'Bùi Thị Lan',       phone_number:'0990123456', is_active:true,  is_verified:true,  wallet_balance:42000,  low_balance_threshold:50000, total_vehicles:2, total_sessions:16, created_at:daysAgo(50)  },
]

export const mockVehicles = [
  { vehicle_id:'v-001', user_id:'u-001', license_plate:'51F-123.45', nickname:'Xe đi làm',   is_active:true },
  { vehicle_id:'v-002', user_id:'u-001', license_plate:'51K-678.90', nickname:'Xe cuối tuần',is_active:true },
  { vehicle_id:'v-003', user_id:'u-002', license_plate:'51G-321.54', nickname:'Wave Alpha',  is_active:true },
  { vehicle_id:'v-004', user_id:'u-003', license_plate:'29F-456.78', nickname:'Xe Hà Nội',   is_active:true },
  { vehicle_id:'v-005', user_id:'u-003', license_plate:'51F-999.11', nickname:'Air Blade',   is_active:true },
  { vehicle_id:'v-006', user_id:'u-004', license_plate:'51H-234.56', nickname:'Vario',       is_active:true },
  { vehicle_id:'v-007', user_id:'u-005', license_plate:'51F-876.54', nickname:'SH mode',     is_active:false },
  { vehicle_id:'v-008', user_id:'u-006', license_plate:'51K-111.22', nickname:'Xe học sinh', is_active:true },
  { vehicle_id:'v-009', user_id:'u-006', license_plate:'51G-333.44', nickname:'Exciter',     is_active:true },
  { vehicle_id:'v-010', user_id:'u-006', license_plate:'30F-555.66', nickname:'Xe phụ',      is_active:true },
  { vehicle_id:'v-011', user_id:'u-007', license_plate:'51F-777.88', nickname:'Lead',        is_active:true },
  { vehicle_id:'v-012', user_id:'u-008', license_plate:'51K-222.33', nickname:'Vision',      is_active:true },
  { vehicle_id:'v-013', user_id:'u-008', license_plate:'51H-444.55', nickname:'Xe cũ',       is_active:true },
  { vehicle_id:'v-014', user_id:'u-009', license_plate:'51F-100.01', nickname:'PCX',         is_active:true },
  { vehicle_id:'v-015', user_id:'u-010', license_plate:'51G-200.02', nickname:'Nouvo',       is_active:true },
  { vehicle_id:'v-016', user_id:'u-010', license_plate:'51K-300.03', nickname:'Xe đạp điện', is_active:true },
]

export const mockDevices = [
  { device_id:'d-001', device_name:'Máy tính Central AI',    device_type:'computer',      lane:'both',  status:'online',      serial_port:null,    ip_address:'192.168.1.10', last_heartbeat:minsAgo(1)  },
  { device_id:'d-002', device_name:'Arduino Cổng Vào',       device_type:'arduino',       lane:'entry', status:'online',      serial_port:'COM3',  ip_address:null,           last_heartbeat:minsAgo(1)  },
  { device_id:'d-003', device_name:'Arduino Cổng Ra',        device_type:'arduino',       lane:'exit',  status:'online',      serial_port:'COM4',  ip_address:null,           last_heartbeat:minsAgo(2)  },
  { device_id:'d-004', device_name:'Camera Khuôn Mặt – Vào', device_type:'camera_face',   lane:'entry', status:'online',      serial_port:null,    ip_address:'192.168.1.21', last_heartbeat:minsAgo(1)  },
  { device_id:'d-005', device_name:'Camera Biển Số – Vào',   device_type:'camera_plate',  lane:'entry', status:'online',      serial_port:null,    ip_address:'192.168.1.22', last_heartbeat:minsAgo(1)  },
  { device_id:'d-006', device_name:'Camera Khuôn Mặt – Ra',  device_type:'camera_face',   lane:'exit',  status:'online',      serial_port:null,    ip_address:'192.168.1.23', last_heartbeat:minsAgo(2)  },
  { device_id:'d-007', device_name:'Camera Biển Số – Ra',    device_type:'camera_plate',  lane:'exit',  status:'error',       serial_port:null,    ip_address:'192.168.1.24', last_heartbeat:hoursAgo(2) },
  { device_id:'d-008', device_name:'Barrier Cổng Vào',       device_type:'barrier',       lane:'entry', status:'online',      serial_port:null,    ip_address:null,           last_heartbeat:minsAgo(1)  },
  { device_id:'d-009', device_name:'Barrier Cổng Ra',        device_type:'barrier',       lane:'exit',  status:'online',      serial_port:null,    ip_address:null,           last_heartbeat:minsAgo(2)  },
  { device_id:'d-010', device_name:'Cảm biến Vào',           device_type:'sensor',        lane:'entry', status:'online',      serial_port:null,    ip_address:null,           last_heartbeat:minsAgo(1)  },
  { device_id:'d-011', device_name:'Cảm biến Ra',            device_type:'sensor',        lane:'exit',  status:'online',      serial_port:null,    ip_address:null,           last_heartbeat:minsAgo(2)  },
  { device_id:'d-012', device_name:'Đèn LED Cổng Vào',       device_type:'led',           lane:'entry', status:'online',      serial_port:null,    ip_address:null,           last_heartbeat:minsAgo(1)  },
  { device_id:'d-013', device_name:'Loa Cổng Vào',           device_type:'speaker',       lane:'entry', status:'offline',     serial_port:null,    ip_address:null,           last_heartbeat:hoursAgo(5) },
  { device_id:'d-014', device_name:'Loa Cổng Ra',            device_type:'speaker',       lane:'exit',  status:'online',      serial_port:null,    ip_address:null,           last_heartbeat:minsAgo(2)  },
]

export const mockActiveSessions = [
  { session_id:'s-a01', vehicle_id:'v-001', user_id:'u-001', license_plate:'51F-123.45', user_name:'Nguyễn Văn An',  entry_time:hoursAgo(2.5), session_type:'member',     lot_id:'lot-001' },
  { session_id:'s-a02', vehicle_id:'v-003', user_id:'u-002', license_plate:'51G-321.54', user_name:'Trần Thị Bích',  entry_time:hoursAgo(1.2), session_type:'member',     lot_id:'lot-001' },
  { session_id:'s-a03', vehicle_id:'v-005', user_id:'u-003', license_plate:'51F-999.11', user_name:'Lê Minh Cường',  entry_time:minsAgo(45),   session_type:'member',     lot_id:'lot-001' },
  { session_id:'s-a04', vehicle_id:'v-009', user_id:'u-006', license_plate:'51G-333.44', user_name:'Ngô Thị Phương', entry_time:hoursAgo(3.8), session_type:'authorized', lot_id:'lot-001' },
  { session_id:'s-a05', vehicle_id:'v-014', user_id:'u-009', license_plate:'51F-100.01', user_name:'Vũ Quốc Khánh', entry_time:minsAgo(18),   session_type:'member',     lot_id:'lot-001' },
  { session_id:'s-a06', vehicle_id:'v-012', user_id:'u-008', license_plate:'51K-222.33', user_name:'Lý Thị Hoa',    entry_time:hoursAgo(0.5), session_type:'member',     lot_id:'lot-001' },
  { session_id:'s-g01', vehicle_id:null,    user_id:null,    license_plate:'52F-445.67', user_name:null,            entry_time:hoursAgo(1.1), session_type:'guest',      lot_id:'lot-001', session_code:'GX-4821' },
  { session_id:'s-g02', vehicle_id:null,    user_id:null,    license_plate:'51B-112.23', user_name:null,            entry_time:minsAgo(33),   session_type:'guest',      lot_id:'lot-001', session_code:'GX-5034' },
]

const genHistory = (id, plate, userName, hoursBack, durationH, fee, type='member', code=null) => ({
  session_id: `sh-${id}`,
  license_plate: plate,
  user_name: userName,
  entry_time: hoursAgo(hoursBack + durationH),
  exit_time: hoursAgo(hoursBack),
  duration_minutes: Math.round(durationH * 60),
  fee,
  session_type: type,
  session_code: code,
  status: 'completed',
})

export const mockSessionHistory = [
  genHistory('001','51F-123.45','Nguyễn Văn An',   0.5, 3.0, 15000),
  genHistory('002','51G-321.54','Trần Thị Bích',   1.0, 2.5, 12000),
  genHistory('003','51K-678.90','Nguyễn Văn An',   2.0, 1.0, 5000),
  genHistory('004','29F-456.78','Lê Minh Cường',   2.5, 4.0, 20000),
  genHistory('005','51H-234.56','Phạm Thị Dung',   3.0, 0.5, 5000),
  genHistory('006','51G-333.44','Ngô Thị Phương',  4.0, 2.0, 10000, 'authorized'),
  genHistory('007','51F-100.01','Vũ Quốc Khánh',   5.0, 1.5, 8000),
  genHistory('008','52F-445.67',null,               6.0, 1.0, 5000, 'guest','GX-4011'),
  genHistory('009','51F-777.88','Đặng Văn Giang',  7.0, 3.5, 18000),
  genHistory('010','51K-222.33','Lý Thị Hoa',      8.0, 2.0, 10000),
  genHistory('011','51F-123.45','Nguyễn Văn An',   24,  4.5, 23000),
  genHistory('012','51B-987.65',null,               25,  2.0, 10000,'guest','GX-3912'),
  genHistory('013','51G-200.02','Bùi Thị Lan',     26,  1.5, 8000),
  genHistory('014','51F-999.11','Lê Minh Cường',   27,  3.0, 15000),
  genHistory('015','51K-111.22','Ngô Thị Phương',  28,  0.8, 5000),
  genHistory('016','51H-444.55','Lý Thị Hoa',      29,  5.0, 25000),
  genHistory('017','51F-876.54','(TK không hoạt động)', 30, 2.0, 10000,'member'),
  genHistory('018','30F-555.66','Ngô Thị Phương',  31,  1.0, 5000),
  genHistory('019','51F-100.01','Vũ Quốc Khánh',   32,  2.5, 13000),
  genHistory('020','51G-321.54','Trần Thị Bích',   33,  1.8, 9000),
]

export const mockEventLogs = [
  { event_id:'e-001', event_type:'vehicle_entry',         license_plate:'51F-123.45', description:'Xe vào – xác thực chính chủ thành công',           created_at:hoursAgo(2.5),  severity:'info'    },
  { event_id:'e-002', event_type:'auth_success_owner',    license_plate:'51F-123.45', description:'Khuôn mặt khớp (similarity: 0.94) – biển số khớp', created_at:hoursAgo(2.5),  severity:'info'    },
  { event_id:'e-003', event_type:'barrier_opened',        license_plate:'51F-123.45', description:'Barrier cổng vào mở',                               created_at:hoursAgo(2.5),  severity:'info'    },
  { event_id:'e-004', event_type:'vehicle_entry',         license_plate:'51G-321.54', description:'Xe vào – xác thực thành công',                     created_at:hoursAgo(1.2),  severity:'info'    },
  { event_id:'e-005', event_type:'auth_failed_face',      license_plate:'51K-555.55', description:'Nhận diện khuôn mặt thất bại – lần 1/3',           created_at:minsAgo(52),    severity:'warning' },
  { event_id:'e-006', event_type:'auth_failed_face',      license_plate:'51K-555.55', description:'Nhận diện khuôn mặt thất bại – lần 2/3 (che mặt)', created_at:minsAgo(51),    severity:'warning' },
  { event_id:'e-007', event_type:'auth_fallback_guest',   license_plate:'51K-555.55', description:'Chuyển sang luồng khách vãng lai sau 3 lần thất bại',created_at:minsAgo(50),   severity:'warning' },
  { event_id:'e-008', event_type:'vehicle_entry_guest',   license_plate:'52F-445.67', description:'Khách vãng lai vào – mã GX-4821',                  created_at:hoursAgo(1.1),  severity:'info'    },
  { event_id:'e-009', event_type:'vehicle_entry',         license_plate:'51F-999.11', description:'Xe vào – xác thực thành công',                     created_at:minsAgo(45),    severity:'info'    },
  { event_id:'e-010', event_type:'low_balance_alert',     license_plate:null,         description:'Số dư ví Lê Minh Cường còn 15.000đ (dưới ngưỡng)', created_at:minsAgo(44),    severity:'warning' },
  { event_id:'e-011', event_type:'auth_success_delegate', license_plate:'51G-333.44', description:'Xác thực ủy quyền – người được ủy quyền lấy xe',   created_at:hoursAgo(3.8),  severity:'info'    },
  { event_id:'e-012', event_type:'device_offline',        license_plate:null,         description:'Loa Cổng Vào mất kết nối (d-013)',                 created_at:hoursAgo(5),    severity:'warning' },
  { event_id:'e-013', event_type:'camera_error',          license_plate:null,         description:'Camera Biển Số Ra gặp lỗi – không phản hồi',       created_at:hoursAgo(2),    severity:'warning' },
  { event_id:'e-014', event_type:'vehicle_entry',         license_plate:'51F-100.01', description:'Xe vào – xác thực thành công',                     created_at:minsAgo(18),    severity:'info'    },
  { event_id:'e-015', event_type:'vehicle_entry',         license_plate:'51K-222.33', description:'Xe vào – xác thực thành công',                     created_at:minsAgo(30),    severity:'info'    },
  { event_id:'e-016', event_type:'vehicle_exit',          license_plate:'51F-123.45', description:'Xe ra – trừ phí 15.000đ, số dư còn 110.000đ',     created_at:minsAgo(30),    severity:'info'    },
  { event_id:'e-017', event_type:'payment_deducted',      license_plate:'51F-123.45', description:'Trừ phí 15.000đ thành công',                       created_at:minsAgo(30),    severity:'info'    },
  { event_id:'e-018', event_type:'barrier_manual_open',   license_plate:'51H-999.00', description:'Admin mở barrier thủ công – "Xe bị kẹt biển số"',  created_at:hoursAgo(4),    severity:'warning' },
  { event_id:'e-019', event_type:'session_abnormal',      license_plate:'51B-200.00', description:'Phiên gửi xe vượt 24h – đánh dấu bất thường',     created_at:hoursAgo(3),    severity:'warning' },
  { event_id:'e-020', event_type:'vehicle_exit_guest',    license_plate:'52F-100.00', description:'Khách vãng lai ra – thanh toán 10.000đ – GX-3912', created_at:hoursAgo(6),    severity:'info'    },
]

export const mockAlerts = [
  { alert_id:'a-001', alert_type:'camera_error',          severity:'critical', title:'Camera Biển Số Ra không phản hồi',       description:'Camera d-007 (IP 192.168.1.24) không phản hồi trong 2 giờ. Ảnh biển số làn ra không thu được.', is_resolved:false, related_device_id:'d-007', created_at:hoursAgo(2) },
  { alert_id:'a-002', alert_type:'device_offline',        severity:'warning',  title:'Loa Cổng Vào mất kết nối',               description:'Thiết bị loa d-013 không gửi heartbeat trong 5 giờ. Thông báo âm thanh tại cổng vào có thể không hoạt động.', is_resolved:false, related_device_id:'d-013', created_at:hoursAgo(5) },
  { alert_id:'a-003', alert_type:'low_balance_user',      severity:'info',     title:'Số dư thấp – Lê Minh Cường',             description:'Tài khoản u-003 (Lê Minh Cường – 0923456789) có số dư 15.000đ, dưới ngưỡng cảnh báo 50.000đ. Xe đang trong bãi.', is_resolved:false, related_user_id:'u-003', created_at:minsAgo(44) },
  { alert_id:'a-004', alert_type:'session_abnormal',      severity:'warning',  title:'Phiên gửi xe bất thường – 51B-200.00',   description:'Biển số 51B-200.00 vào bãi cách đây hơn 24 giờ nhưng chưa ra. Cần kiểm tra nếu xe vẫn trong bãi.', is_resolved:false, created_at:hoursAgo(3) },
  { alert_id:'a-005', alert_type:'arduino_disconnected',  severity:'critical', title:'Arduino Cổng Ra mất kết nối USB Serial', description:'Arduino d-003 (COM4) không phản hồi. Barrier và cảm biến cổng ra có thể không hoạt động.', is_resolved:false, related_device_id:'d-003', created_at:minsAgo(10) },
]

export const mockDailyReports = [
  { date:'24/03', total_sessions:112, member_sessions:89, guest_sessions:23, total_revenue:580000, member_revenue:445000, guest_revenue:135000, auth_success:104, auth_failed:8 },
  { date:'25/03', total_sessions:98,  member_sessions:78, guest_sessions:20, total_revenue:512000, member_revenue:395000, guest_revenue:117000, auth_success:91,  auth_failed:7 },
  { date:'26/03', total_sessions:125, member_sessions:101,guest_sessions:24, total_revenue:648000, member_revenue:502000, guest_revenue:146000, auth_success:117, auth_failed:8 },
  { date:'27/03', total_sessions:87,  member_sessions:70, guest_sessions:17, total_revenue:452000, member_revenue:349000, guest_revenue:103000, auth_success:81,  auth_failed:6 },
  { date:'28/03', total_sessions:134, member_sessions:108,guest_sessions:26, total_revenue:694000, member_revenue:540000, guest_revenue:154000, auth_success:127, auth_failed:7 },
  { date:'29/03', total_sessions:119, member_sessions:95, guest_sessions:24, total_revenue:618000, member_revenue:476000, guest_revenue:142000, auth_success:112, auth_failed:7 },
  { date:'30/03', total_sessions:67,  member_sessions:54, guest_sessions:13, total_revenue:348000, member_revenue:269000, guest_revenue:79000,  auth_success:62,  auth_failed:5 },
]

export const mockHourlyTraffic = [
  { hour:'05h', count:2 }, { hour:'06h', count:12 }, { hour:'07h', count:38 },
  { hour:'08h', count:55 }, { hour:'09h', count:41 }, { hour:'10h', count:28 },
  { hour:'11h', count:22 }, { hour:'12h', count:35 }, { hour:'13h', count:30 },
  { hour:'14h', count:25 }, { hour:'15h', count:27 }, { hour:'16h', count:32 },
  { hour:'17h', count:58 }, { hour:'18h', count:61 }, { hour:'19h', count:44 },
  { hour:'20h', count:29 }, { hour:'21h', count:18 }, { hour:'22h', count:9 },
]

export const mockPricing = [
  { config_id:'p-001', time_slot_name:'Ban ngày', slot_start:'06:00', slot_end:'18:00', price_per_hour:5000,  minimum_fee:5000,  is_active:true },
  { config_id:'p-002', time_slot_name:'Buổi tối', slot_start:'18:00', slot_end:'22:00', price_per_hour:8000,  minimum_fee:8000,  is_active:true },
  { config_id:'p-003', time_slot_name:'Ban đêm',  slot_start:'22:00', slot_end:'06:00', price_per_hour:3000,  minimum_fee:3000,  is_active:true },
]

export const mockSystemConfig = [
  { config_key:'face_match_threshold',        config_value:'0.6',  data_type:'decimal', description:'Ngưỡng Cosine Similarity tối thiểu để chấp nhận khuôn mặt (0.0–1.0)' },
  { config_key:'max_verify_attempts',         config_value:'3',    data_type:'integer', description:'Số lần thử nhận diện tối đa trước khi chuyển khách vãng lai' },
  { config_key:'max_parking_hours_alert',     config_value:'24',   data_type:'integer', description:'Số giờ gửi xe tối đa before đánh dấu phiên bất thường' },
  { config_key:'low_balance_default_threshold',config_value:'50000',data_type:'decimal', description:'Ngưỡng số dư thấp mặc định khi tạo ví mới (VND)' },
  { config_key:'barrier_auto_close_delay_ms', config_value:'3000', data_type:'integer', description:'Thời gian delay đóng barrier sau khi xe qua (ms)' },
  { config_key:'camera_capture_timeout_ms',   config_value:'5000', data_type:'integer', description:'Timeout chụp ảnh 2 camera đồng thời (ms)' },
  { config_key:'offline_sync_retry_interval_s',config_value:'30',  data_type:'integer', description:'Chu kỳ thử đồng bộ lại khi có kết nối mạng (giây)' },
  { config_key:'guest_session_code_prefix',   config_value:'GX',   data_type:'string',  description:'Tiền tố mã phiên khách vãng lai (VD: GX-4821)' },
]

export const mockTransactions = [
  { transaction_id:'t-001', user_id:'u-001', transaction_type:'topup',  amount:200000, balance_after:325000, payment_gateway:'vnpay',        status:'success', created_at:daysAgo(3)   },
  { transaction_id:'t-002', user_id:'u-001', transaction_type:'deduct', amount:15000,  balance_after:310000, payment_gateway:'system',       status:'success', created_at:daysAgo(3)   },
  { transaction_id:'t-003', user_id:'u-001', transaction_type:'deduct', amount:20000,  balance_after:290000, payment_gateway:'system',       status:'success', created_at:daysAgo(2)   },
  { transaction_id:'t-004', user_id:'u-001', transaction_type:'deduct', amount:10000,  balance_after:280000, payment_gateway:'system',       status:'success', created_at:daysAgo(2)   },
  { transaction_id:'t-005', user_id:'u-001', transaction_type:'topup',  amount:100000, balance_after:380000, payment_gateway:'momo',         status:'success', created_at:daysAgo(1)   },
  { transaction_id:'t-006', user_id:'u-003', transaction_type:'topup',  amount:100000, balance_after:115000, payment_gateway:'zalopay',      status:'success', created_at:daysAgo(5)   },
  { transaction_id:'t-007', user_id:'u-003', transaction_type:'deduct', amount:50000,  balance_after:65000,  payment_gateway:'system',       status:'success', created_at:daysAgo(4)   },
  { transaction_id:'t-008', user_id:'u-003', transaction_type:'deduct', amount:50000,  balance_after:15000,  payment_gateway:'system',       status:'success', created_at:daysAgo(2)   },
]

export { fmtVND }
