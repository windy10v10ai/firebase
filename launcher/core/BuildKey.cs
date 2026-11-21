using System.IO;
using System.Text;

namespace Windy10v10AI.Launcher
{
    // The settlement key is public in the same sense as the exe it ships in, but it still must not be committed,
    // logged, or packed into feedback. Release builds embed it from the build environment only.
    static class BuildKey
    {
        static readonly string value = Read();

        public static string LauncherApiKey { get { return value; } }

        static string Read()
        {
            try
            {
                using (var stream = typeof(BuildKey).Assembly.GetManifestResourceStream("launcher-api-key.txt"))
                {
                    if (stream == null) return "";
                    using (var reader = new StreamReader(stream, Encoding.UTF8)) return reader.ReadToEnd().Trim();
                }
            }
            catch (System.Exception)
            {
                return "";
            }
        }
    }
}
