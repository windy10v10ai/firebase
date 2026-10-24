# dmgbuild 配置：窗口大小与背景图对应，两个图标落在箭头两侧
import os

app = defines["app"]
background = defines["background"]

# 挂载后的卷用应用自己的图标
icon = os.path.join(app, "Contents/Resources/Launcher.icns")
files = [app]
symlinks = {"Applications": "/Applications"}
icon_locations = {"Windy10v10AI.app": (180, 190), "Applications": (480, 190)}
background = background
format = "UDZO"
window_rect = ((200, 120), (660, 400))
icon_size = 128
text_size = 13
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
default_view = "icon-view"
arrange_by = None
