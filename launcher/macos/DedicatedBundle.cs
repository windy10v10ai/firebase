// GPL-3.0.

namespace Windy10v10AI.Launcher {
    sealed class DedicatedBundle:IDisposable {
        readonly string root;
        public string Folder {get;}
        public string Exe {get;}
        public DedicatedBundle(MacInstall install) {
            root=Path.Combine(Path.GetTempPath(),"windymac-dedicated-"+Guid.NewGuid().ToString("N"));
            var game=Path.Combine(root,"game");Directory.CreateDirectory(game);
            foreach(var dir in Directory.EnumerateDirectories(install.Game)) {var name=Path.GetFileName(dir);if(name!="bin")Directory.CreateSymbolicLink(Path.Combine(game,name),dir);}
            Folder=Path.Combine(game,"bin","osx64","WindyMac Dedicated.app");
            var contents=Path.Combine(Folder,"Contents");var macos=Path.Combine(contents,"MacOS");Directory.CreateDirectory(macos);
            Exe=Path.Combine(macos,"dota2-dedicated");File.Copy(install.Exe,Exe);
            File.SetUnixFileMode(Exe,UnixFileMode.UserRead|UnixFileMode.UserWrite|UnixFileMode.UserExecute);
            File.WriteAllText(Path.Combine(contents,"Info.plist"),"""
            <?xml version="1.0" encoding="UTF-8"?>
            <plist version="1.0"><dict>
            <key>CFBundleExecutable</key><string>dota2-dedicated</string>
            <key>CFBundleIdentifier</key><string>local.windymac.dedicated</string>
            <key>CFBundleName</key><string>WindyMac Dedicated</string>
            <key>CFBundlePackageType</key><string>APPL</string>
            <key>LSBackgroundOnly</key><true/>
            <key>LSUIElement</key><true/>
            </dict></plist>
            """);
        }
        public void Dispose(){
            try {
                var game=Path.Combine(root,"game");
                foreach(var dir in Directory.EnumerateDirectories(game))
                    if(new DirectoryInfo(dir).LinkTarget!=null)Directory.Delete(dir);
                Directory.Delete(root,true);
            }catch{}
        }
    }
}
