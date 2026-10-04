using System.Globalization;

namespace Windy10v10AI.Launcher
{
    static class Strings
    {
        static readonly string Lang = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;

        static string Pick(string zh, string en, string ru)
        {
            if (Lang == "zh") return zh;
            if (Lang == "ru" || Lang == "uk" || Lang == "be" || Lang == "kk") return ru;
            return en;
        }

        public static string Title { get { return Pick("Windy10v10AI 启动器", "Windy10v10AI Launcher", "Windy10v10AI Лаунчер"); } }
        public static string Subtitle { get { return Pick("本地启动服务器，性能优化", "Local server for better performance", "Локальный сервер для лучшей производительности"); } }

        public static string Easy { get { return Pick("简单", "Easy", "Лёгкий"); } }
        public static string Hard { get { return Pick("困难", "Hard", "Сложный"); } }
        public static string Custom { get { return Pick("自定义", "Custom", "Свой"); } }
        public static string CustomSub { get { return Pick("自定义难度", "Custom difficulty", "Своя сложность"); } }

        public static string Idle { get { return Pick("点击难度即可开始游戏", "Click a difficulty to start", "Выберите сложность, чтобы начать"); } }
        public static string Starting { get { return Pick("正在启动，请稍候…", "Starting, please wait...", "Запуск, подождите…"); } }
        public static string StartingSub { get { return Pick("启动中…", "Starting…", "Запуск…"); } }
        public static string StartingHint { get { return Pick("通常需要 30 秒到 1 分钟，完成后会自动打开 Dota 2", "Usually takes 30 seconds to a minute. Dota 2 opens when ready.", "Обычно это занимает до минуты. Dota 2 откроется автоматически."); } }
        public static string ServerStarting { get { return Pick("正在启动服务器，已等待 {0} 秒（通常 30 秒到 1 分钟）", "Starting the server, {0}s so far (usually 30-60s)", "Запуск сервера: {0} с (обычно 30–60 с)"); } }
        public static string ServerSlow { get { return Pick("比平时慢，仍在启动服务器，已等待 {0} 秒", "Slower than usual, still starting the server: {0}s", "Дольше обычного, сервер ещё запускается: {0} с"); } }
        public static string OpeningDota { get { return Pick("服务器已就绪，正在打开 Dota 2…", "Server ready, opening Dota 2...", "Сервер готов, открываем Dota 2…"); } }
        public static string OpeningRoom { get { return Pick("正在创建联机房间…", "Creating the room...", "Создание комнаты…"); } }
        public static string ClosingDota { get { return Pick("正在关闭 Dota 2…", "Closing Dota 2...", "Закрываем Dota 2…"); } }
        public static string InGame { get { return Pick("游戏中", "In game", "В игре"); } }
        public static string InGameHint { get { return Pick("关闭 Dota 2 后服务器会自动关闭", "The server stops when you close Dota 2", "Сервер остановится после закрытия Dota 2"); } }
        public static string Cancel { get { return Pick("取消", "Cancel", "Отмена"); } }
        public static string StopServer { get { return Pick("关闭服务器", "Stop server", "Остановить сервер"); } }

        public static string MapReady { get { return Pick("地图已是最新版本", "Map is up to date", "Карта обновлена"); } }
        public static string MapChecking { get { return Pick("正在检测地图版本", "Checking map version", "Проверка версии карты"); } }
        public static string MapUnverified { get { return Pick("无法确认地图是否最新", "Map version unconfirmed", "Версия карты не проверена"); } }
        public static string MapOutdated { get { return Pick("地图需要更新", "Map needs an update", "Карту нужно обновить"); } }
        public static string MapMissing { get { return Pick("没有找到地图", "Map not found", "Карта не найдена"); } }
        public static string MapUnknown { get { return Pick("没有找到 Dota 2", "Dota 2 not found", "Dota 2 не найдена"); } }

        public static string OutdatedNotice { get { return Pick("地图不是最新版本，需要更新。请在 Steam 里等待下载完成（期间不要打开 Dota 2），或打开 Dota 2 手动更新地图后再启动。", "The map is out of date. Wait for Steam to finish downloading it (keep Dota 2 closed), or open Dota 2 and update the map, then start again.", "Карта устарела. Дождитесь загрузки в Steam (не открывая Dota 2) или откройте Dota 2 и обновите карту, затем запустите снова."); } }
        public static string NoSteam { get { return Pick("没有找到 Steam，请先安装 Steam 和 Dota 2。", "Steam was not found. Install Steam and Dota 2 first.", "Steam не найден. Сначала установите Steam и Dota 2."); } }
        public static string NoDota { get { return Pick("没有找到 Dota 2，请先在 Steam 安装。", "Dota 2 was not found. Install it in Steam first.", "Dota 2 не найдена. Сначала установите её в Steam."); } }
        public static string NoMap { get { return Pick("没有找到地图，请先订阅 10v10 AI，等待 Steam 下载完成。", "Map not found. Subscribe to 10v10 AI and wait for Steam to download it.", "Карта не найдена. Подпишитесь на 10v10 AI и дождитесь загрузки в Steam."); } }
        public static string Timeout { get { return Pick("启动失败：服务器没有按时启动完成。请再试一次；多次失败请把日志发给我们。", "Launch failed: the server did not start in time. Try again; if it keeps failing, send us the log.", "Сервер не запустился вовремя. Попробуйте ещё раз; если ошибка повторяется, отправьте нам лог."); } }
        public static string ServerExited { get { return Pick("服务器意外退出。请再试一次；多次失败请把日志发给我们。", "The server stopped unexpectedly. Try again; if it keeps failing, send us the log.", "Сервер неожиданно остановился. Попробуйте ещё раз; если ошибка повторяется, отправьте нам лог."); } }
        public static string DotaBlocked { get { return Pick("启动失败：Dota 2 没能启动，可能被杀毒软件拦截了。请在杀毒软件里把 Windy10v10AI.exe 加入信任，再试一次。", "Launch failed: Dota 2 could not start, possibly blocked by antivirus. Allow Windy10v10AI.exe in your antivirus, then try again.", "Не удалось запустить Dota 2 — возможно, её блокирует антивирус. Разрешите Windy10v10AI.exe в антивирусе и попробуйте снова."); } }
        public static string DotaNotClosed { get { return Pick("启动失败：没能关闭正在运行的 Dota 2。请在任务管理器里结束 dota2.exe，再试一次。", "Launch failed: could not close the running Dota 2. End dota2.exe in Task Manager, then try again.", "Не удалось закрыть запущенную Dota 2. Завершите dota2.exe в диспетчере задач и попробуйте снова."); } }
        public static string LaunchFailed { get { return Pick("启动失败：", "Launch failed: ", "Не удалось запустить: "); } }
        public static string OpenWorkshop { get { return Pick("打开创意工坊", "Open Workshop", "Открыть Мастерскую"); } }
        public static string Subscribe { get { return Pick("订阅地图", "Subscribe", "Подписаться"); } }
        public static string OpenLog { get { return Pick("打开日志", "Open log", "Открыть лог"); } }

        public static string UpdateAvailable { get { return Pick("发现新版本 v{0}，更新后启动器会自动重启。", "Version {0} is available. The launcher restarts after updating.", "Доступна версия {0}. Лаунчер перезапустится после обновления."); } }
        public static string Update { get { return Pick("更新", "Update", "Обновить"); } }
        public static string Updating { get { return Pick("正在下载新版本…", "Downloading the new version...", "Загрузка новой версии…"); } }
        public static string UpdateFailed { get { return Pick("自动更新失败，请到官网下载新版本。", "Update failed. Download the new version from our website.", "Не удалось обновить. Скачайте новую версию на сайте."); } }
        public static string OpenDownloadPage { get { return Pick("打开官网", "Open website", "Открыть сайт"); } }
        public static string Changelog { get { return Pick("查看更新日志", "View changelog", "Список изменений"); } }

        public static string Developer { get { return Pick("开发选项", "Developer", "Для разработчиков"); } }
        public static string UseTestMap { get { return Pick("使用测试服", "Use test map", "Тестовая карта"); } }

        public static string Solo { get { return Pick("单人游戏", "Single player", "Одиночная игра"); } }
        public static string HostRoom { get { return Pick("联机主机", "Host", "Хост"); } }
        public static string JoinRoom { get { return Pick("加入联机", "Join", "Присоединиться"); } }
        public static string HostIdle { get { return Pick("点击难度，创建联机主机", "Click a difficulty to host a game", "Выберите сложность, чтобы стать хостом"); } }
        public static string PrivatePrompt { get { return Pick("好友房：输入房主发来的房间码", "Friends room: enter the code from the host", "Комната для друзей: введите код от хоста"); } }
        public static string PublicRooms { get { return Pick("公开房间", "Public rooms", "Открытые комнаты"); } }
        public static string RoomCount { get { return Pick("{0} 个", "{0}", "{0}"); } }
        public static string ActiveGames { get { return Pick("正在进行：{0} 局 · {1} 人", "In progress: {0} games · {1} players", "В игре: {0} игр · {1} игроков"); } }
        public static string Refresh { get { return Pick("刷新", "Refresh", "Обновить"); } }
        public static string ColumnMap { get { return Pick("地图", "Map", "Карта"); } }
        public static string ColumnPlayers { get { return Pick("人数", "Players", "Игроки"); } }
        public static string ColumnPing { get { return Pick("延迟", "Ping", "Пинг"); } }
        public static string Full { get { return Pick("已满", "Full", "Мест нет"); } }
        public static string ProbeLatency { get { return Pick("延迟 {0} ms", "Ping {0} ms", "Пинг {0} мс"); } }
        public static string ProbeTesting { get { return Pick("正在测试能否连通", "Testing the connection", "Проверяем соединение"); } }
        public static string ProbeFailed { get { return Pick("你的网络连不上这个房间", "Your network cannot reach this room", "Ваша сеть не может подключиться к этой комнате"); } }
        public static string SymmetricNat { get { return Pick("你的网络类型可能无法联机，将在后续版本解决", "Your network type may not support online play. A later version will fix this.", "Ваш тип сети может не подходить для игры по сети — исправим позже."); } }
        public static string RoomsLoading { get { return Pick("正在获取房间列表…", "Loading rooms...", "Загрузка комнат…"); } }
        public static string RoomsFailed { get { return Pick("获取房间列表失败，请点「刷新」重试", "Could not load rooms. Press Refresh to try again.", "Не удалось загрузить комнаты. Нажмите «Обновить»."); } }
        public static string NoRooms { get { return Pick("现在没有公开房间，可以自己开一个", "No public rooms right now. Host one yourself!", "Сейчас нет открытых комнат — создайте свою!"); } }
        public static string RoomType { get { return Pick("房间类型", "Room", "Комната"); } }
        public static string PublicRoom { get { return Pick("公开", "Public", "Открытая"); } }
        public static string PrivateRoom { get { return Pick("好友", "Friends", "Для друзей"); } }
        public static string MaxPlayers { get { return Pick("人数上限", "Max players", "Лимит"); } }
        public static string PlayersOption { get { return Pick("{0} 人", "{0} players", "{0} чел."); } }
        public static string Kick { get { return Pick("移出", "Remove", "Удалить"); } }
        public static string KickConfirm { get { return Pick("移出 {0}？", "{0}?", "{0}?"); } }
        public static string KickedByHost { get { return Pick("你已被房主移出房间。", "The host removed you from the room.", "Хост удалил вас из комнаты."); } }
        public static string KickedJoin { get { return Pick("你已被房主移出，不能再加入这个房间。", "The host removed you, so you can't join this room again.", "Хост удалил вас, в эту комнату больше не войти."); } }
        public static string BackToList { get { return Pick("返回列表", "Back to list", "К списку"); } }
        public static string RoomFull { get { return Pick("房间已满，请加入别的房间。", "The room is full. Join another one.", "Комната заполнена. Выберите другую."); } }
        public static string RoomClosed { get { return Pick("超过 15 分钟未开始，房间已关闭", "Not started within 15 minutes, so the room is closed", "Игра не началась за 15 минут, комната закрыта"); } }
        public static string Reopen { get { return Pick("重新开放", "Reopen", "Открыть снова"); } }
        public static string RoomCode { get { return Pick("房间码", "Room code", "Код комнаты"); } }
        public static string CodeExample { get { return Pick("例：Z82QCT", "e.g. Z82QCT", "Например: Z82QCT"); } }
        public static string Join { get { return Pick("加入", "Join", "Войти"); } }
        public static string Paste { get { return Pick("粘贴", "Paste", "Вставить"); } }
        public static string Copy { get { return Pick("复制", "Copy", "Копировать"); } }
        public static string RoomStartingHint { get { return Pick("Windows 可能询问是否允许联网，请点允许", "Windows may ask whether to allow network access. Please allow it.", "Windows может запросить доступ к сети — разрешите его."); } }
        public static string PublicHostingHint { get { return Pick("其他玩家能在列表里看到这个房间，也可以把房间码发给朋友，人到齐后在游戏里点「锁定并开始」", "Other players can find this room in the list, or send the code to friends. Start in game once everyone is in.", "Комнату видно в списке, можно и отправить код друзьям. Начните игру, когда все зайдут."); } }
        public static string PrivateHostingHint { get { return Pick("不在列表里显示，只有拿到房间码的朋友能加入，人到齐后在游戏里点「锁定并开始」", "Hidden from the list; only friends with the code can join. Start in game once everyone is in.", "Комнаты нет в списке, войти можно только по коду. Начните игру, когда все зайдут."); } }
        public static string OpenRoomFailed { get { return Pick("开房失败，请检查网络后重试。", "Could not open a room. Check your network and try again.", "Не удалось открыть комнату. Проверьте сеть и попробуйте снова."); } }
        public static string InvalidCode { get { return Pick("请输入 6 位房间码。", "Enter the 6-character room code.", "Введите 6-значный код комнаты."); } }
        public static string Connecting { get { return Pick("正在连接房主…", "Connecting to the host...", "Подключение к хосту…"); } }
        public static string ConnectingHint { get { return Pick("通常几秒内完成，最多需要 15 秒", "Usually takes a few seconds, at most 15", "Обычно несколько секунд, максимум 15"); } }
        public static string RoomNotFound { get { return Pick("房间不存在或已关闭，请核对房间码。", "Room not found or already closed. Check the code.", "Комната не найдена или закрыта. Проверьте код."); } }
        public static string GameStarted { get { return Pick("游戏已开始，无法加入。", "The game has already started.", "Игра уже началась."); } }
        public static string VersionMismatch { get { return Pick("双方启动器版本不同，请都更新到最新版本。", "Your launcher versions differ. Both of you need the latest version.", "Версии лаунчера отличаются. Обновите лаунчер у обоих."); } }
        public static string RoomNetwork { get { return Pick("连不上服务器，请检查网络后重试。", "Could not reach our server. Check your network and try again.", "Не удалось связаться с сервером. Проверьте сеть и попробуйте снова."); } }
        public static string ConnectFailed { get { return Pick("因为网络问题，目前无法连接。请进入别的主机，或更换网络环境后再试。", "Could not connect because of a network problem. Join another host, or try again on a different network.", "Не удалось подключиться из-за проблем с сетью. Присоединитесь к другому хосту или попробуйте другую сеть."); } }
        public static string Joined { get { return Pick("已加入房间 {0}", "Joined room {0}", "Вы в комнате {0}"); } }
        public static string JoinedHint { get { return Pick("Dota 2 关闭后可以重新进入游戏", "If Dota 2 closes, you can go back into the game", "Если Dota 2 закроется, можно вернуться в игру"); } }
        public static string LeaveRoom { get { return Pick("离开房间", "Leave room", "Покинуть комнату"); } }
        public static string Rejoin { get { return Pick("重新进入游戏", "Rejoin game", "Вернуться в игру"); } }
        public static string HostLost { get { return Pick("房主已关闭游戏，或连接已断开。", "The host closed the game or the connection was lost.", "Хост закрыл игру, или соединение потеряно."); } }

        public static string PlayersInRoom { get { return Pick("房间里的玩家", "Players in the room", "Игроки в комнате"); } }
        public static string PlayerCount { get { return Pick("{0} 人", "{0} players", "Игроков: {0}"); } }
        public static string TagHost { get { return Pick("房主", "Host", "Хост"); } }
        public static string TagMe { get { return Pick("我", "Me", "Я"); } }
        public static string Player { get { return Pick("玩家", "Player", "Игрок"); } }
        public static string StatusConnecting { get { return Pick("连接中…", "Connecting...", "Подключение…"); } }
        public static string StatusLoading { get { return Pick("已连通，正在载入", "Connected, loading", "Подключён, загрузка"); } }
        public static string StatusHostLoading { get { return Pick("正在载入", "Loading", "Загрузка"); } }
        public static string StatusInGame { get { return Pick("已进入游戏", "In game", "В игре"); } }
        public static string StatusFailed { get { return Pick("连接失败", "Could not connect", "Не удалось подключиться"); } }
        public static string StatusLeft { get { return Pick("已离开", "Left", "Вышел"); } }
        public static string HostSilent { get { return Pick("与房主的连接中断，正在重连…", "Lost contact with the host, reconnecting...", "Связь с хостом прервана, переподключение…"); } }
        public static string MapCardTitle { get { return Pick("联机需要最新版地图", "Online play needs the latest map", "Для игры по сети нужна последняя версия карты"); } }
        public static string MapCardHost { get { return Pick("地图正在等待 Steam 更新。更新完成前不能创建联机主机，期间不要打开 Dota 2。", "The map is waiting for a Steam update. You can host once it finishes; keep Dota 2 closed until then.", "Карта ждёт обновления в Steam. Хостить можно после обновления; до этого не открывайте Dota 2."); } }
        public static string MapCardJoin { get { return Pick("地图正在等待 Steam 更新。更新完成后这张卡片会自动消失，再点「加入」即可，期间不要打开 Dota 2。", "The map is waiting for a Steam update. This card disappears once it finishes; then press Join. Keep Dota 2 closed until then.", "Карта ждёт обновления в Steam. После обновления эта карточка исчезнет — нажмите «Войти». До этого не открывайте Dota 2."); } }
        public static string MapHostOld { get { return Pick("房主的地图不是最新版本：请房主关掉服务器，等地图更新完成后重新开房（房间码会变）。", "The host's map is out of date. The host needs to stop the server, wait for the update and host again (the code will change).", "У хоста устаревшая карта. Хосту нужно остановить сервер, дождаться обновления и создать комнату заново (код изменится)."); } }
        public static string MapMismatch { get { return Pick("你和房主的地图版本不同：请两人都确认地图已更新到最新版。", "You and the host have different map versions. Both of you need the latest map.", "У вас и хоста разные версии карты. Обновите карту у обоих."); } }

        public static string DotaRunningTitle { get { return Pick("Dota 2 正在运行", "Dota 2 is running", "Dota 2 запущена"); } }
        public static string DotaRunningBody { get { return Pick("需要先关闭 Dota 2，再用本地服务器重新启动。正在进行的对局会断开。", "Dota 2 will be closed and restarted with the local server. Any match in progress will be disconnected.", "Dota 2 будет закрыта и перезапущена с локальным сервером. Текущий матч будет прерван."); } }
        public static string CloseAndStart { get { return Pick("关闭并启动", "Close and start", "Закрыть и запустить"); } }
        public static string QuitTitle { get { return Pick("关闭启动器", "Close launcher", "Закрыть лаунчер"); } }
        public static string QuitBody { get { return Pick("关闭启动器会同时关闭服务器，正在进行的游戏会断开。", "Closing the launcher also stops the server and ends the current game.", "Закрытие лаунчера остановит сервер и прервёт текущую игру."); } }
        public static string Close { get { return Pick("关闭", "Close", "Закрыть"); } }
    }
}
