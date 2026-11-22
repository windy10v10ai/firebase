using System;
using System.IO;
using System.Text;

namespace Windy10v10AI.Launcher
{
    // The settlement key is public in the same sense as the exe it ships in, but it still must not be committed,
    // logged, or packed into feedback. Release builds embed it from the build environment only, masked so reading
    // it out of the binary takes one deliberate step; this is not a security boundary.
    static class BuildKey
    {
        const byte Mask = 0x5B;
        static readonly string value = Read();

        public static string LauncherApiKey { get { return value; } }

        static string Read()
        {
            try
            {
                using (var stream = typeof(BuildKey).Assembly.GetManifestResourceStream("launcher-api-key.txt"))
                {
                    if (stream == null) return "";
                    using (var reader = new StreamReader(stream, Encoding.UTF8))
                    {
                        var packed = reader.ReadToEnd().Trim();
                        return packed.Length == 0 ? "" : Unpack(packed);
                    }
                }
            }
            catch (Exception)
            {
                return "";
            }
        }

        internal static string Unpack(string packed)
        {
            var bytes = Convert.FromBase64String(packed);
            for (var i = 0; i < bytes.Length; i++) bytes[i] = (byte)(bytes[i] ^ Mask);
            return Encoding.UTF8.GetString(bytes).Trim();
        }
    }
}
