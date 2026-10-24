using System.Collections.Generic;

namespace Windy10v10AI.Launcher
{
    static class RoomPeer
    {
        public static Dictionary<string, object> Body(long steamId, string mapVersion, List<Candidate> candidates, bool? symmetricNat)
        {
            return new Dictionary<string, object>
            {
                { "steamId", steamId },
                { "mapVersion", mapVersion },
                { "candidates", candidates.ConvertAll(c => c.ToString()).ToArray() },
                { "upnp", false },
                { "symmetricNat", symmetricNat },
                { "protocolVersion", RoomApi.ProtocolVersion },
                { "launcherVersion", LauncherVersion.Current }
            };
        }

        public static void AddRelays(Dictionary<string, object> body, List<RelayLeg> relays)
        {
            if (relays == null) return;
            var encoded = RelayLeg.Encode(relays);
            if (encoded.Count == 0) return;
            body["relays"] = encoded;
            object rtt;
            if (encoded[0].TryGetValue("rtt", out rtt)) body["relayRtt"] = rtt;
            body["relayLoss"] = encoded[0]["loss"];
        }
    }
}
