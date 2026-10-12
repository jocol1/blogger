// Shared chrome/error translations. Never pass player-authored content to this translator.
(function (root) {
  'use strict';
  const dictionary = {
    'Locly Party · Càng thân càng dễ bị réo': 'Locly Party · Good friends. Bad alibis.',
    'Locly Party — tạo phòng, gửi mã cho bạn bè và chơi bốn trò cà khịa có duyên.': 'Locly Party — create a room, invite your friends and play four delightfully chaotic party games.',
    'Trò chơi': 'Arcade', 'VÍ CỦA BẠN': 'YOUR WALLET',
    'PHÒNG CHƠI CHO HỘI BẠN THÂN': 'A GAME NIGHT FOR YOUR FAVORITE PEOPLE',
    'Càng thân,': 'Good friends,', 'càng dễ bị réo.': 'terrible alibis.',
    'Một người mở phòng, cả nhóm vào bằng điện thoại. Không có bạn online thì gọi bot vào tấu hài cùng — không cần cài ứng dụng hay đăng nhập.': 'One person hosts. Everyone joins on their phone. Friends offline? Add a few clearly labeled bots and bring the chaos. No downloads or accounts.',
    '3–10 người hoặc bot': '3–10 players, including bots', '1 trận miễn phí': '1 free game',
    'Khách vào không tốn xu': 'Guests join free', 'Ai vừa': 'Who just', 'réo tên tui?': 'called me out?',
    'Đang kết nối phòng chơi…': 'Connecting to the party…', 'LÀM CHỦ CUỘC VUI': 'HOST THE CHAOS',
    'Tạo phòng mới': 'Create a room', 'Mời bạn bè bằng mã sáu ký tự. Bạn chọn trò và điều khiển nhịp trận.': 'Invite friends with a six-character code. Pick a game and get the night started.',
    'Biệt danh của bạn': 'Your nickname', 'Ví dụ: Chúa tể đi trễ': 'e.g. Captain Always Late',
    'Tạo phòng miễn phí': 'Create a free room', 'ĐÃ CÓ MÃ PHÒNG': 'GOT AN INVITE?',
    'Vào réo bạn bè': 'Join your friends', 'Nhập mã chủ phòng gửi. Người tham gia không cần ví xu.': 'Enter your host\'s room code. Guests do not need a coin wallet.',
    'Mã phòng': 'Room code', 'Đừng dùng tên thật cũng được': 'Your alter ego is welcome', 'Vào phòng': 'Join room',
    'BỐN TRÒ · BỐN KIỂU MẤT TÌNH BẠN': 'FOUR GAMES. ENDLESS GROUP-CHAT MATERIAL.',
    'Tối nay réo ai?': 'Who are we calling out tonight?', '01 · BỎ PHIẾU KÍN': '01 · SECRET VOTES',
    'Tòa án bạn thân': 'Bestie Court', 'Réo tên, nghe biện hộ rồi cả hội quyết định tha hay phạt.': 'Call someone out, hear their defense and let the group deliver its deeply unserious verdict.',
    '02 · ĐOÁN TÁC GIẢ': '02 · GUESS THE WRITER', 'Ai viết câu này?': 'Who Wrote That?',
    'Cùng trả lời một câu hỏi. Đọc câu bựa và đoán xem ai viết.': 'Answer the same prompt anonymously. Then figure out which friend wrote that ridiculous reply.',
    '03 · GIẤU VAI TRÒ': '03 · SECRET ROLES', 'Kẻ nằm vùng': 'Undercover',
    'Một người nhận từ khác. Nói đủ khéo để không bị cả nhóm phát hiện.': 'One player gets a different word. Blend in, give a clue and try not to look suspicious.',
    '04 · VIẾT · VẼ · ĐOÁN': '04 · WRITE · DRAW · GUESS', 'Vẽ chuyền tay': 'Draw & Pass',
    '“Mèo đi đòi nợ” qua vài bàn tay có thể thành bất cứ thứ gì.': 'Start with "a cat collecting debts". After a few drawings and guesses, all bets are off.',
    'CHƠI THỬ': 'TRY IT OUT', 'Mỗi ví được thử một lần': 'One trial game per wallet',
    'MỞ KHÓA CUỘC VUI': 'KEEP THE PARTY GOING', '19 xu · 2 giờ': '19 coins · 2 hours',
    'Mua một lần, cả nhóm cùng chơi': 'One host pays. Everyone plays.', 'Nạp xu': 'Add coins',
    'PHÒNG PARTY': 'PARTY ROOM', 'Âm thanh: tắt': 'Sound: off', 'Sao chép link mời': 'Copy invite link',
    'Khóa phòng': 'Lock room', 'Mở khóa phòng': 'Unlock room', 'NGƯỜI CHƠI': 'PLAYERS',
    '＋ Thêm một bot': '＋ Add a bot', 'Tôi sẵn sàng': 'I\'m ready',
    'Mở phòng 2 giờ · 19 xu': 'Unlock 2 hours · 19 coins', 'Đóng phòng': 'Close room',
    'CHỌN TRÒ': 'PICK A GAME', 'Cả nhóm muốn mất lòng kiểu nào?': 'Choose your flavor of chaos.',
    'Réo tên · biện hộ · phán quyết': 'Call out · defend · verdict', 'Viết ẩn danh · đoán tác giả': 'Write anonymously · guess the writer',
    'Nhận từ khóa · giấu thân phận': 'Get a word · hide your role', 'Viết một câu · vẽ lại · đoán tiếp': 'Write a prompt · draw · guess',
    'Cần ít nhất 3 người và tất cả sẵn sàng': 'At least 3 players, all ready', 'Bắt đầu trận': 'Start game',
    'Cà khịa có duyên. Thử thách luôn có thể bỏ qua.': 'Keep it playful. Any challenge can be skipped.',
    'Quản trị': 'Admin', 'Đóng ảnh': 'Close image', 'Bức vẽ chuyền tay': 'Draw & Pass artwork',
    'Thanh toán hiện qua chuyển khoản ngân hàng Việt Nam (VND). 19 xu = 19.000đ. Chưa hỗ trợ thẻ quốc tế.': 'Payments currently use Vietnamese bank transfers in VND. 19 coins = VND 19,000. International cards are not supported yet.',
    'Ngôn ngữ phòng được chọn khi tạo và giữ nguyên cho cả nhóm.': 'The host chooses the room language when creating it. Everyone plays in that language.',
    'Kết nối đang gián đoạn.': 'Connection interrupted. Please try again.', 'Không tải được bức vẽ.': 'Could not load the drawing.',
    'Âm thanh:': 'Sound:', 'bật': 'on', 'tắt': 'off', '5 vòng': '5 rounds', '3 vòng': '3 rounds', 'đi qua cả nhóm': 'one turn per player',
    'Đã mở khóa phòng. Bạn có 24 giờ để bắt đầu.': 'Room unlocked. You have 24 hours to start.',
    'Phòng đang mở khóa': 'Room unlocked', 'Còn': 'Remaining:', 'để chơi không giới hạn.': 'of unlimited games.',
    'Gói 19 xu đã sẵn sàng': 'Your 19-coin pass is ready', 'Đồng hồ 2 giờ sẽ chạy khi bắt đầu trận tiếp theo.': 'Your two-hour timer starts with the next game.',
    'Gói chưa dùng đã được hoàn': 'Unused pass refunded', '19 xu đã quay lại ví chủ phòng.': '19 coins returned to the host\'s wallet.',
    'Còn một trận chơi thử': 'One free trial game left', 'Bất kỳ trò nào · cả nhóm cùng chơi miễn phí.': 'Pick any game. The whole group plays free.',
    'Đã dùng trận miễn phí': 'Free trial used', 'Chủ phòng mở khóa 2 giờ để chơi tiếp.': 'The host can unlock two hours to keep playing.',
    'Đã bị loại': 'Eliminated', '🤖 Luôn sẵn sàng': '🤖 Always ready', '✓ Sẵn sàng': '✓ Ready', 'Chưa sẵn sàng': 'Not ready',
    'Trao quyền': 'Make host', 'Xóa bot': 'Remove bot', 'Mời ra': 'Remove', '✓ Đã sẵn sàng': '✓ Ready',
    'Cần thêm': 'Need', 'người hoặc bot': 'more players or bots', 'Đang chờ mọi người sẵn sàng': 'Waiting for everyone to be ready',
    'Cần mở khóa phòng để chơi tiếp': 'Unlock the room to keep playing', 'Cả nhóm đã sẵn sàng': 'Everyone is ready',
    'Trang sẽ tự thử lại.': 'We will reconnect automatically.', 'BỎ PHIẾU KÍN · AI ĐÁNG NGỜ NHẤT?': 'SECRET VOTE · WHO IS THE PRIME SUSPECT?',
    'Đã chốt lá phiếu': 'Vote submitted', 'Đợi hội đồng gọi tên bị cáo…': 'Waiting for the court to call the accused…',
    'BỊ CÁO:': 'THE ACCUSED:', 'Viết lời biện hộ đủ thuyết phục hoặc đủ buồn cười…': 'Make your defense convincing. Or at least funny…',
    'Gửi lời biện hộ': 'Submit defense', 'Đang nghe biện hộ': 'Hearing the defense', 'Bị cáo': 'The accused',
    'có 30 giây để cứu lấy danh dự.': 'has 30 seconds to save their reputation.', 'LỜI BIỆN HỘ CỦA': 'THE DEFENSE OF',
    'Bị cáo giữ quyền im lặng.': 'The accused has chosen to remain silent.', 'Đang chờ phán quyết': 'Awaiting the verdict',
    'Hội đồng đang cân nhắc rất thiếu nghiêm túc.': 'The court is considering this with absolutely no seriousness.',
    'Tha': 'Forgive', 'Phạt': 'Challenge', 'KẾT QUẢ VÒNG': 'ROUND RESULT', 'có tội!': 'is guilty!', 'được tha!': 'is forgiven!',
    'Không ai bị réo': 'Nobody was called out', 'Thử thách:': 'Challenge:', 'Có thể bỏ qua nếu không thoải mái.': 'Skip this if you are not comfortable.',
    'Vòng tiếp theo sẽ tự bắt đầu.': 'The next round starts automatically.', 'VIẾT ẨN DANH · ĐỪNG ĐỂ LỘ VĂN PHONG': 'WRITE ANONYMOUSLY · HIDE YOUR STYLE',
    'Đã nộp câu trả lời': 'Answer submitted', 'Chờ những cây hài còn lại viết xong…': 'Waiting for the other comedians…',
    'Câu trả lời càng thật càng dễ bị bắt…': 'The more honest it is, the easier you are to spot…', 'Gửi ẩn danh': 'Send anonymously',
    'AI ĐÃ VIẾT CÂU NÀY?': 'WHO WROTE THAT?', 'Đây là câu của bạn': 'That is your answer',
    'Giữ vẻ mặt bình thường và xem mọi người đoán.': 'Keep a straight face while everyone guesses.', 'Đã chốt đáp án': 'Guess submitted',
    'Đợi mọi người lật mặt tác giả…': 'Waiting for the writer to be revealed…', 'LỘ DIỆN TÁC GIẢ': 'WRITER REVEALED',
    'Vòng này chưa đủ câu trả lời': 'No answers this round', 'Một cây hài bí ẩn': 'A mystery comedian',
    'TỪ KHÓA BÍ MẬT CỦA BẠN': 'YOUR SECRET WORD', 'Bạn là Kẻ nằm vùng. Hãy nói sao cho giống mọi người.': 'You are Undercover. Try to sound like everyone else.',
    'Bạn thuộc phe thường. Hãy tìm người có từ khác.': 'You are a citizen. Find the player with the different word.',
    'Đưa một gợi ý, đừng nói thẳng từ khóa…': 'Give a clue without saying your word…', 'Gửi gợi ý': 'Send clue', 'Đến lượt': 'Next up:',
    'Quan sát gợi ý và đừng để lộ nét mặt.': 'Watch the clues and keep your poker face.', 'TỪ KHÓA CỦA BẠN': 'YOUR WORD',
    'Thảo luận trực tiếp trong 60 giây.': 'Talk to each other for 60 seconds.', 'Đến giờ soi nhau': 'Time to get suspicious',
    'Ai đang cố nói giống người bình thường nhất?': 'Who is trying a little too hard to blend in?',
    'BỎ PHIẾU LẠI · ĐANG HÒA': 'TIED VOTE · VOTE AGAIN', 'BỎ PHIẾU LOẠI KẺ NẰM VÙNG': 'VOTE OUT THE UNDERCOVER PLAYER',
    'Ai đang nói hơi đáng ngờ?': 'Who sounds a little suspicious?', 'Chờ cả nhóm đưa ra phán quyết…': 'Waiting for the group verdict…',
    'Không xuất được bức vẽ.': 'Could not export the drawing.', 'Không gửi được bức vẽ.': 'Could not send the drawing.',
    'Không tải được bức vẽ': 'Could not load the drawing', 'Xóa toàn bộ nét vẽ?': 'Clear the whole drawing?',
    'Đang gửi…': 'Sending…', 'Gửi bức vẽ': 'Send drawing', 'người đã gửi': 'players submitted',
    'Viết câu mở đầu': 'Write the opening prompt', 'Vẽ lại điều bạn vừa đọc': 'Draw what you just read', 'Đoán bức hình này là gì': 'Guess what this drawing shows',
    'BẠN CHỈ ĐƯỢC NHÌN BỨC NÀY': 'THIS IS THE ONLY DRAWING YOU CAN SEE', 'Bức vẽ cần đoán': 'Drawing to guess',
    'BẠN CHỈ ĐƯỢC NHÌN CÂU NÀY': 'THIS IS THE ONLY PROMPT YOU CAN SEE', 'LƯỢT TRƯỚC BỎ QUA': 'PREVIOUS TURN SKIPPED',
    'Tự do sáng tác tiếp nhé!': 'Make up what happens next!', 'Đã gửi bài': 'Submitted', 'Đợi những cây hài còn lại.': 'Waiting for the other comedians.',
    'Ví dụ: Con mèo đi đòi nợ bằng xe đạp…': 'e.g. A cat collecting debts on a bicycle…', 'Bạn nghĩ người trước đang vẽ gì?': 'What do you think they drew?',
    'Cho tôi một câu bựa': 'Give me a silly prompt', 'Gửi câu này': 'Send this prompt', 'Bảng vẽ': 'Drawing canvas',
    'Màu': 'Color', 'Mảnh': 'Thin', 'Vừa': 'Medium', 'Đậm': 'Thick', 'Tẩy': 'Eraser', 'Hoàn tác': 'Undo', 'Xóa': 'Clear',
    'Kết quả đã hết hạn': 'Results expired', 'Nội dung Vẽ chuyền tay được giữ trong 7 ngày sau khi trận kết thúc.': 'Draw & Pass content is available for seven days after the game ends.',
    'MỞ XÍCH ·': 'THE BIG REVEAL ·', 'CHUỖI': 'CHAINS', 'Xem nó đã biến thành cái gì!': 'Look what it turned into!',
    'Mỗi người tự mở từng chuỗi. Không có thắng thua, chỉ có bằng chứng.': 'Reveal each chain at your own pace. No winners. Just evidence.',
    'Khởi đầu bởi': 'Started by', 'Mở chuỗi': 'Reveal chain', 'Thu lại': 'Collapse', 'câu gốc': 'original prompt', 'đoán': 'guess', 'vẽ': 'drawing',
    'Bỏ lượt': 'Turn skipped', 'Bức vẽ ở bước': 'Drawing at step', 'Tải chuỗi này': 'Download this chain',
    'Chọn trò tiếp': 'Pick another game', 'Đang xuất ảnh…': 'Exporting…', 'Không xuất được chuỗi.': 'Could not export the chain.',
    'Chuỗi': 'Chain', 'Bước': 'Step', 'Trang': 'Page', 'Trận đấu đã xong!': 'Game over!',
    'đã qua mặt cả nhóm!': 'fooled everyone!', 'Đã bắt được': 'Caught', 'TỔNG KẾT · PHÒNG': 'RESULTS · ROOM',
    'Từ thường:': 'Citizen word:', 'Từ nằm vùng:': 'Undercover word:', 'Tải ảnh kết quả': 'Download results',
    'TRẬN ĐÃ KẾT THÚC': 'GAME OVER', 'VÒNG': 'ROUND', 'XONG': 'DONE', 'Phòng': 'Room',
    'KẺ NẰM VÙNG THẮNG': 'UNDERCOVER WINS', 'ĐÃ BẮT ĐƯỢC NẰM VÙNG': 'UNDERCOVER CAUGHT', 'Bí ẩn': 'Mystery',
    'Cà khịa có duyên tại locly.lol/party': 'Friendly chaos at locly.lol/party', 'Đang gọi bot…': 'Calling a bot…',
    'Đang mở khóa…': 'Unlocking…', 'Đóng phòng này? Sau đó bạn có thể tạo phòng mới.': 'Close this room? You can create a new one afterwards.',
    'Đã sao chép link mời.': 'Invite link copied.', 'Mã phòng:': 'Room code:', 'Đang tạo phòng…': 'Creating room…',
    'Đang vào phòng…': 'Joining room…', '✓ Phòng chơi đang sẵn sàng.': '✓ Ready when you are.', 'Locly Party chưa sẵn sàng.': 'Locly Party is not available yet.',
    'người chơi': 'player', 'người': 'players', 'xu': 'coins', 'giờ': 'h', 'phút': 'min', 'điểm': 'points',
    'Bạn thao tác quá nhanh. Hãy thử lại sau.': 'Too many requests. Please try again later.',
    'Biệt danh không hợp lệ.': 'Invalid nickname.', 'Biệt danh phải từ 1 đến 30 ký tự.': 'Nicknames must be 1–30 characters.',
    'Nội dung không hợp lệ.': 'Invalid text.', 'Nội dung phải từ 1 đến': 'Text must contain 1–', 'ký tự.': 'characters.',
    'Bạn không còn ở trong phòng.': 'You are no longer in this room.', 'Mã ví không hợp lệ.': 'Invalid wallet token.',
    'Không tìm thấy ví.': 'Wallet not found.', 'Mã người chơi không hợp lệ.': 'Invalid player token.',
    'Không tìm thấy người chơi trong phòng.': 'Player not found in this room.', 'Không thể hoàn xu cho phòng.': 'Could not refund the room.',
    'Mã phòng không hợp lệ.': 'Invalid room code.', 'Không tìm thấy phòng.': 'Room not found.',
    'Chỉ chủ phòng điều khiển thao tác này.': 'Only the host can do that.', 'Người chơi không hợp lệ.': 'Invalid player.',
    'Trận chưa bắt đầu.': 'The game has not started.', 'Lượt này đã hết giờ.': 'This turn has ended.',
    'Bạn không thể tự bỏ phiếu cho mình.': 'You cannot vote for yourself.', 'Bạn đã bỏ phiếu.': 'You already voted.',
    'Chỉ bị cáo được biện hộ.': 'Only the accused can submit a defense.', 'Bạn đã gửi lời biện hộ.': 'You already submitted your defense.',
    'Bị cáo không được tự phán quyết.': 'The accused cannot vote on their own verdict.', 'Phán quyết không hợp lệ.': 'Invalid verdict.',
    'Bạn đã phán quyết.': 'You already submitted a verdict.', 'Hãy chờ vòng tiếp theo.': 'Please wait for the next round.',
    'Bạn đã gửi câu trả lời.': 'You already submitted an answer.', 'Tác giả không cần đoán câu của mình.': 'You cannot guess your own answer.',
    'Bạn đã đoán.': 'You already submitted a guess.', 'Hãy gửi bài Vẽ chuyền tay bằng đúng biểu mẫu của lượt này.': 'Use this turn\'s Draw & Pass form to submit.',
    'Bạn đã bị loại khỏi ván.': 'You have been eliminated.', 'Chưa tới lượt bạn.': 'It is not your turn yet.',
    'Lá phiếu không hợp lệ.': 'Invalid vote.', 'Hãy chờ giai đoạn bỏ phiếu.': 'Please wait for voting to begin.',
    'Ngôn ngữ không hợp lệ.': 'Choose English or Vietnamese.', 'Yêu cầu tạo phòng không hợp lệ.': 'Invalid room creation request.',
    'Bạn đang sở hữu phòng': 'You already own room', 'Chưa tạo được mã phòng. Vui lòng thử lại.': 'Could not create a room code. Please try again.',
    'Yêu cầu vào phòng không hợp lệ.': 'Invalid join request.', 'Phòng đã đóng.': 'This room is closed.', 'Phòng đang khóa.': 'This room is locked.',
    'Trận đang diễn ra. Hãy vào sau khi trận kết thúc.': 'A game is in progress. Join when it finishes.', 'Phòng đã đủ 10 người.': 'This room already has 10 players.',
    'Biệt danh này đã có trong phòng.': 'That nickname is already taken in this room.', 'Yêu cầu mua gói không hợp lệ.': 'Invalid purchase request.',
    'Chỉ chủ ví tạo phòng được mua gói.': 'Only the wallet owner who created the room can buy a pass.',
    'Hãy chơi trận miễn phí trước khi mua gói.': 'Play your free trial game before buying a pass.', 'Ví cần đủ 19 xu để mở phòng.': 'You need 19 coins to unlock the room.',
    'Thao tác phòng không hợp lệ.': 'Invalid room action.', 'Không tìm thấy ví chủ phòng.': 'Host wallet not found.',
    'Không thể đổi trạng thái khi đang chơi.': 'You cannot change ready status during a game.', 'Chỉ thêm bot ở phòng chờ.': 'Bots can only be added in the lobby.',
    'Phòng đã đủ bot vui tính.': 'No more bots are available.', 'Trò chơi không hợp lệ.': 'Invalid game selection.',
    'Không thể loại chủ ví.': 'The wallet owner cannot be removed.', 'Chỉ loại người chơi ở phòng chờ.': 'Players can only be removed in the lobby.',
    'Bot không thể làm chủ phòng.': 'Bots cannot become the host.', 'Một trận đang diễn ra.': 'A game is already in progress.',
    'Cần ít nhất 3 người để bắt đầu.': 'At least three players are needed.', 'Mọi người cần bấm sẵn sàng.': 'Everyone needs to press Ready.',
    'Bạn cần mua gói 19 xu để chơi tiếp.': 'Buy a 19-coin pass to keep playing.', 'Không tìm thấy lượt của bạn.': 'Your turn could not be found.',
    'Lượt này cần gửi một bức vẽ.': 'This turn requires a drawing.', 'Chỉ chủ ví được đóng phòng.': 'Only the wallet owner can close the room.',
    'Hãy kết thúc trận trước khi đóng phòng.': 'Finish the game before closing the room.', 'Loại thao tác không hợp lệ.': 'Invalid action type.',
    'Yêu cầu gửi hình không hợp lệ.': 'Invalid drawing submission.', 'Ảnh vẽ không hợp lệ.': 'Invalid drawing.',
    'Không tìm thấy ảnh vẽ.': 'Drawing not found.', 'Bạn chưa được xem bức vẽ này.': 'You cannot view this drawing yet.',
    'Kết quả trận đã hết thời hạn lưu trữ.': 'These game results have expired.', 'Trận Vẽ chuyền tay chưa bắt đầu.': 'Draw & Pass has not started.',
    'Lượt này đã thay đổi. Bài nháp vẫn được giữ trên thiết bị.': 'The turn has changed. Your draft is still saved on this device.',
    'Loại bài gửi không đúng lượt.': 'This submission does not match the turn.', 'Bạn đã gửi bài ở lượt này.': 'You already submitted this turn.',
    'Chỉ nhận ảnh vẽ PNG hoặc WebP.': 'Drawings must be PNG or WebP.', 'Ảnh vẽ tối đa 1 MB.': 'Drawings must be no larger than 1 MB.',
    'Tệp gửi lên không phải ảnh hợp lệ.': 'The uploaded file is not a valid image.', 'Định dạng ảnh vẽ không hợp lệ.': 'Invalid drawing format.',
    'Bức vẽ quá phức tạp để lưu. Hãy bớt nét rồi thử lại.': 'This drawing is too complex to save. Simplify it and try again.',
    'Không thể nhận ảnh vẽ.': 'Could not receive the drawing.', 'JSON không hợp lệ.': 'Invalid JSON.',
    'Không tải đủ ảnh để xuất kết quả.': 'Could not load all images for export.',
    'LOCLY.PARTY · VẼ CHUYỀN TAY': 'LOCLY.PARTY · DRAW & PASS',
    'Kết nối phòng chơi đang gián đoạn. Hãy thử lại.': 'Party connection interrupted. Please try again.',
  };
  const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const phrases = Object.keys(dictionary).sort((a, b) => b.length - a.length);
  // A single pass prevents translated text being translated again. Boundaries protect words.
  const matcher = new RegExp(`(?<![\\p{L}\\p{N}])(?:${phrases.map(escapeRegex).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  function translate(value, language = 'en') {
    if (language !== 'en') return String(value);
    return String(value).replace(matcher, match => dictionary[match]);
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { translate }; return; }
  let language = new URLSearchParams(location.search).get('lang') || localStorage.getItem('locly-party-language') || 'en';
  language = language === 'vi' ? 'vi' : 'en';
  const originals = [];
  function captureChrome() {
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName) && node.textContent.trim()) originals.push({ node, text: node.textContent });
    }
    document.querySelectorAll('[placeholder], [aria-label], [alt], meta[name="description"]').forEach(node => {
      for (const attr of ['placeholder', 'aria-label', 'alt', 'content']) if (node.hasAttribute(attr)) originals.push({ node, attr, text: node.getAttribute(attr) });
    });
  }
  function setLanguage(value) {
    language = value === 'vi' ? 'vi' : 'en';
    document.documentElement.lang = language;
    localStorage.setItem('locly-party-language', language);
    for (const item of originals) {
      if (!item.node.isConnected) continue;
      const text = translate(item.text, language);
      if (item.attr) item.node.setAttribute(item.attr, text); else item.node.textContent = text;
    }
    document.querySelectorAll('a[href="/party"]').forEach(link => link.href = `/party?lang=${language}`);
    const select = document.getElementById('party-language');
    if (select) select.value = language;
  }
  function t(strings, ...values) {
    if (typeof strings === 'string') return translate(strings, language);
    // Only template's authored segments are translated, never interpolation values.
    return strings.reduce((result, segment, index) => result + translate(segment, language) + (index < values.length ? values[index] : ''), '');
  }
  captureChrome(); setLanguage(language);
  root.LoclyPartyI18n = { t, setLanguage, get language() { return language; } };
})(typeof window !== 'undefined' ? window : globalThis);
