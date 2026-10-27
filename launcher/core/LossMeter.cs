using System;
using System.Collections.Generic;

namespace Windy10v10AI.Launcher
{
    // Loss on one direction of a route, judged over the last few seconds of game traffic
    struct LinkLoss
    {
        public int BadSeconds;
        public int Loss;
        // Seconds that carried enough game traffic to be judged; 0 means there is nothing to go on
        public int Seconds;
    }

    // Counts the numbered game packets that arrive each second, so the receiving side sees one direction's loss on its own.
    // Small sparse pings cross routes that drop large dense game traffic, so only the game's own packets show that loss
    class LossMeter
    {
        public const int NoData = -1;
        // Below this a second carries no real game traffic, such as between games or while the map loads
        const int MinPackets = 10;
        const int KeepSeconds = 60;
        const byte NoDataByte = 255;

        readonly List<int> seconds = new List<int>();
        bool started;
        ushort highest;
        ushort secondStart;
        long second;
        int received;

        // Packets expected and received over every finished second that carried game traffic
        public long Expected;
        public long Received;

        public void Add(ushort seq, long nowMs)
        {
            Roll(nowMs);
            if (!started)
            {
                started = true;
                highest = seq;
                secondStart = (ushort)(seq - 1);
                second = nowMs / 1000;
            }
            else if ((short)(seq - highest) > 0)
            {
                highest = seq;
            }
            received++;
        }

        // Loss percentages of the last finished seconds, oldest first, with NoData where too little arrived to judge
        public List<int> Recent(int count, long nowMs)
        {
            Roll(nowMs);
            var start = Math.Max(0, seconds.Count - count);
            return seconds.GetRange(start, seconds.Count - start);
        }

        // A new route starts its own record; the totals stay, since they describe the whole game
        public void ClearRecent()
        {
            seconds.Clear();
        }

        void Roll(long nowMs)
        {
            if (!started) return;
            var now = nowMs / 1000;
            if (now - second > KeepSeconds) second = now - KeepSeconds;
            while (second < now)
            {
                var expected = (ushort)(highest - secondStart);
                // A packet that arrives out of order across a second boundary counts in the later second
                var got = Math.Min(received, (int)expected);
                if (expected >= MinPackets)
                {
                    seconds.Add((expected - got) * 100 / expected);
                    Expected += expected;
                    Received += got;
                }
                else
                {
                    seconds.Add(NoData);
                }
                if (seconds.Count > KeepSeconds) seconds.RemoveAt(0);
                secondStart = highest;
                received = 0;
                second++;
            }
        }

        // The totals and the last few seconds, so the other side can judge the direction it sends on and report the whole game
        public byte[] EncodeReport(int count, long nowMs)
        {
            var recent = Recent(count, nowMs);
            var report = new byte[9 + recent.Count];
            Buffer.BlockCopy(BitConverter.GetBytes((uint)Math.Min(Expected, uint.MaxValue)), 0, report, 0, 4);
            Buffer.BlockCopy(BitConverter.GetBytes((uint)Math.Min(Received, uint.MaxValue)), 0, report, 4, 4);
            report[8] = (byte)recent.Count;
            for (var i = 0; i < recent.Count; i++) report[9 + i] = recent[i] == NoData ? NoDataByte : (byte)recent[i];
            return report;
        }

        public static bool DecodeReport(byte[] data, int offset, out long expected, out long received, out List<int> recent)
        {
            expected = 0;
            received = 0;
            recent = null;
            if (data.Length < offset + 9) return false;
            var count = data[offset + 8];
            if (data.Length < offset + 9 + count) return false;
            expected = BitConverter.ToUInt32(data, offset);
            received = BitConverter.ToUInt32(data, offset + 4);
            recent = new List<int>(count);
            for (var i = 0; i < count; i++)
            {
                var value = data[offset + 9 + i];
                recent.Add(value == NoDataByte ? NoData : Math.Min((int)value, 100));
            }
            return true;
        }

        // Each direction is judged on its own, since loss on a route is often one-sided; the worse direction decides
        public static LinkLoss Judge(List<int> down, List<int> up, int badLossPct)
        {
            var a = JudgeOne(down, badLossPct);
            var b = JudgeOne(up, badLossPct);
            return new LinkLoss
            {
                BadSeconds = Math.Max(a.BadSeconds, b.BadSeconds),
                Loss = Math.Max(a.Loss, b.Loss),
                Seconds = Math.Max(a.Seconds, b.Seconds),
            };
        }

        public static LinkLoss JudgeOne(List<int> recent, int badLossPct)
        {
            var result = new LinkLoss();
            if (recent == null) return result;
            var sum = 0;
            foreach (var loss in recent)
            {
                if (loss == NoData) continue;
                result.Seconds++;
                sum += loss;
                if (loss >= badLossPct) result.BadSeconds++;
            }
            if (result.Seconds > 0) result.Loss = sum / result.Seconds;
            return result;
        }

        // Loss over the game traffic between two readings of a running total, or NoData when too little passed to tell
        public static int Between(long expectedBefore, long receivedBefore, long expectedNow, long receivedNow)
        {
            var expected = expectedNow - expectedBefore;
            var received = receivedNow - receivedBefore;
            if (expected < MinPackets || received < 0) return NoData;
            return (int)(Math.Max(0, expected - received) * 100 / expected);
        }
    }
}
