# Prism Browser Community

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [Русский](README.ru.md) | **[Tiếng Việt](README.vi.md)** | [ไทย](README.th.md) | [Português (Brasil)](README.pt-BR.md)

[Français](README.fr.md) | [Українська](README.uk.md) | [Español](README.es.md) | [Türkçe](README.tr.md) | [日本語](README.ja.md) | [हिन्दी](README.hi.md)

Tác giả: [DFarm](https://x.com/DFarm_club) · Trang chính thức: [prismbrowser.app](https://prismbrowser.app/)

Prism Browser là trình quản lý hồ sơ trình duyệt cục bộ có thể cấu hình dấu vân tay, được xây dựng trên Chromium tùy chỉnh. Mỗi hồ sơ có cookie, bộ nhớ đệm, dữ liệu tiện ích, cài đặt proxy và dấu vân tay riêng, giúp quản lý nhiều danh tính trình duyệt tách biệt.

Theo mặc định, hồ sơ, cookie, thông tin xác thực proxy và lịch sử duyệt web nằm trên thiết bị của người dùng. Bản Community miễn phí và không giới hạn số hồ sơ cục bộ.

## Chính sách duy trì mã nguồn

Kho mã này tiếp tục được công khai để học tập, xem xét và tự biên dịch. Từ `v0.3.17`, tính năng, bản sửa lỗi và thay đổi mã nguồn của sản phẩm không còn được đồng bộ thường xuyên vào đây. Ứng dụng, các bộ máy trình duyệt, gói đa nền tảng và tính năng Pro ngày càng phức tạp, làm tăng chi phí duy trì và kiểm thử nhiều nhánh.

Đây là một ngoại lệ: bản cập nhật này chuyển phần hỗ trợ đa ngôn ngữ dùng chung từ 0.3.19 sang mã công khai và dịch giao diện hiện có. Không bao gồm môi trường thực thi riêng của Pro, dịch vụ cấp phép, tính năng Pro mới hay cấu hình phát hành riêng. Việc đồng bộ liên tục mã nguồn sản phẩm không được khôi phục.

Mã hiện có, lịch sử commit và các bản phát hành cũ được giữ lại. Xem [trang chính thức](https://prismbrowser.app/) và [Releases](../../releases) để tải trình cài đặt, cập nhật tính năng và bản sửa lỗi.

## Ngôn ngữ

Giao diện và README có **13 ngôn ngữ**: tiếng Trung giản thể, Trung phồn thể, Anh, Nga, Việt, Thái, Bồ Đào Nha Brazil, Pháp, Ukraina, Tây Ban Nha, Thổ Nhĩ Kỳ, Nhật và Hindi. Chọn ngôn ngữ README bằng các liên kết ở đầu trang.

- Khi khởi động, ứng dụng chọn ngôn ngữ hiển thị chính của hệ thống; nếu không đọc được hoặc chưa hỗ trợ thì dùng tiếng Anh.
- Bộ chọn ở góc trên bên phải đổi ngôn ngữ ngay lập tức. Lựa chọn thủ công được lưu cục bộ và được ưu tiên trong các lần mở sau.
- Ngôn ngữ giao diện độc lập với ngôn ngữ dấu vân tay và múi giờ của hồ sơ. Tên, ghi chú, thẻ và nội dung chưa lưu được giữ nguyên.
- Bản dịch được tích hợp sẵn, không cần dịch trực tuyến. Xem [hướng dẫn bản địa hóa bằng tiếng Trung và tiếng Anh](docs/localization.md) để đóng góp.

## Tải xuống và bắt đầu

Tải gói phù hợp từ [Releases](../../releases): DMG hoặc ZIP cho macOS; trình cài đặt hoặc bản Portable cho Windows. Các gói phát hành có sẵn bộ máy Chromium 144 hỗ trợ dấu vân tay; người dùng thông thường không cần tự biên dịch Chromium.

Nếu hệ thống chặn bản chưa ký, xác nhận mở trong **Cài đặt hệ thống → Quyền riêng tư & Bảo mật** trên macOS, hoặc chọn **Thông tin thêm → Vẫn chạy** trong SmartScreen của Windows. Chỉ tải từ Releases của dự án và đối chiếu SHA-256 với giá trị được công bố.

1. Mở Prism Browser và tạo hồ sơ mới.
2. Nhập tên rồi chọn hệ điều hành, ngôn ngữ, múi giờ, màn hình và danh tính phần cứng.
3. Dùng kết nối trực tiếp nếu không cần proxy. Nếu cần, nhập giao thức, máy chủ, cổng và thông tin xác thực rồi kiểm tra kết nối.
4. Lưu và mở hồ sơ. Khi đóng cửa sổ, cookie, bộ nhớ đệm, dấu trang và dữ liệu tiện ích vẫn được giữ lại.

Mỗi hồ sơ dùng một thư mục dữ liệu riêng. Nhân bản giữ nguyên cài đặt nhưng tạo danh tính và giá trị hạt giống (seed) mới.

## Tính năng

Mọi thứ chạy trên máy cục bộ: không có tài khoản, gói đăng ký hay kích hoạt. API tự động hóa cục bộ, tác vụ theo lịch và điều khiển AI cục bộ qua MCP đều thuộc bản miễn phí, còn nhân dấu vân tay đi kèm ứng dụng.

Community cung cấp hồ sơ cục bộ không giới hạn, dữ liệu độc lập, proxy HTTP/HTTPS/SOCKS5 và chống rò rỉ WebRTC. Có thể cấu hình User-Agent, ngôn ngữ, múi giờ, màn hình, CPU, bộ nhớ và GPU, với tính nhất quán giữa Canvas, WebGL, Audio, DOMRect, phông chữ, Speech và WebGPU.

Có nhân bản, nhóm, thẻ, mục yêu thích, thao tác hàng loạt, thùng rác và di chuyển cục bộ cookie, từng hồ sơ hoặc toàn bộ không gian làm việc. Biểu tượng Dock trên macOS và thanh tác vụ Windows có thể hiển thị số hồ sơ.

## Phạm vi kiểm chứng

Dự án dùng Pixelscan, CreepJS, BrowserLeaks, IPhey, ma trận dấu vân tay Prism và công cụ kiểm tra dữ liệu hồ sơ để kiểm tra tính nhất quán danh tính, độ ổn định sau khi mở lại với cùng seed, sự tách biệt giữa các seed, tính nhất quán iframe/Worker và khả năng lưu giữ dữ liệu.

Bài kiểm tra của bên thứ ba thay đổi theo thời gian; không có cam kết vượt qua tất cả mãi mãi. Chất lượng proxy, uy tín IP, máy tính từ xa, phông chữ và phần cứng thật cũng ảnh hưởng kết quả.

## Phát triển và biên dịch

Cần Node.js 22 trở lên, npm và công cụ biên dịch cơ bản của nền tảng. Chạy tại thư mục gốc kho mã:

```bash
# Cài đặt, kiểm tra và biên dịch
npm ci
npm run typecheck
npm run build

# Chế độ phát triển
npm run dev

# Đóng gói macOS
npm run dist:mac

# Đóng gói Windows
npm run dist:win
```

Các lệnh đóng gói này không kèm bộ máy dấu vân tay. Để biên dịch Chromium 144, nên có 32 GB RAM, khoảng 300 GB SSD trống và đường dẫn ngắn không có khoảng trắng.

- macOS arm64: Xcode, Git, Python 3, Ninja và ổ APFS. Chấp nhận giấy phép Xcode rồi xem [hướng dẫn biên dịch](tools/macos-kernel/README.md).
- Windows x64: Windows 10/11, Visual Studio với phát triển ứng dụng desktop bằng C++, Windows SDK, Git, Python 3 và ổ NTFS. Nên dùng môi trường ảo Python sạch. Xem [hướng dẫn biên dịch](tools/windows-kernel/README.md).

Phiên bản cố định, commit nguồn, thứ tự bản vá và SHA-256 nằm trong `tools/kernel-lock.json`; bản vá chung ở `tools/kernel-patches`. Chạy lại `Build-Kernel` để tiếp tục sau khi bị gián đoạn. Kết quả nằm trong `artifacts/<version>-<platform>` dưới thư mục biên dịch; nhật ký ở `logs`. Lệnh chi tiết cũng có trong [README tiếng Anh](README.md).

Trong trang quản lý bộ máy của Prism, nhập bản biên dịch cục bộ: chọn `Chromium.app` trên macOS hoặc thư mục chứa `chrome.exe` trên Windows. Kiểm tra trước khi kích hoạt; dữ liệu và cài đặt hiện có được giữ lại.

## Bảo mật và giấy phép

Không đăng mã kích hoạt, mật khẩu proxy, cookie, thông tin ví, khóa riêng hay tệp chẩn đoán chứa dữ liệu cá nhân trong issue công khai. Cung cấp bước tái hiện tối thiểu, phiên bản, nền tảng và ảnh hưởng sau khi loại bỏ dữ liệu nhạy cảm. Thay đổi điểm kiểm tra dấu vân tay không nhất thiết là lỗ hổng; hãy nêu trang kiểm tra, thời gian, phiên bản bộ máy và các mục không đạt.

Mã thuộc Prism Browser Community dùng [giấy phép MIT](LICENSE). Chromium, Electron và các thành phần bên thứ ba giữ giấy phép riêng. Khi phân phối Chromium, phải giữ các tệp `LICENSE`, `LICENSES` và thông báo bắt buộc. Giấy phép mã nguồn không tự động cấp quyền nhãn hiệu đối với tên, logo hoặc biểu tượng Prism.

Chỉ sử dụng cho việc tách biệt trình duyệt, kiểm thử tự động, nghiên cứu quyền riêng tư và quản lý tài khoản hợp pháp, được cho phép; tuân thủ điều khoản của trang đích và luật địa phương.

## Lịch sử số sao

[![Prism Browser Community Star History](https://api.star-history.com/svg?repos=DFarm6/Prism-Browser-Community&type=Date)](https://www.star-history.com/#DFarm6/Prism-Browser-Community&Date)
