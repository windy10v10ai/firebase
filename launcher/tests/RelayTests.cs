using System;
using System.Collections.Generic;
using System.Net;

namespace Windy10v10AI.Launcher.Tests
{
    static class RelayTests
    {
        public static void RunAll()
        {
            ReadsAddressListInOrder();
            FallsBackToSingleLegacyAddress();
            PrefersTheListOverTheLegacyField();
            ReturnsNullWithoutAnyAddress();
            EstimateUsesTheLowestMatchingRelayPair();
            EstimateIgnoresLossyLegs();
            EstimateFallsBackToTheLegacyFigure();
            RouteCheckReadsScoreAndLegacyLimits();
            RouteCheckSwitchesOnScore();
            RouteCheckFallsBackToLossLimits();
            ProbeTakesTheBestAddressMedian();
            Console.WriteLine("PASS Relay tests");
        }

        static void ReadsAddressListInOrder()
        {
            var ticket = RelayTicket.Read(new Dictionary<string, object>
            {
                { "relay", new Dictionary<string, object>
                    {
                        { "addresses", new object[] { "1.2.3.4:100", "5.6.7.8:200" } },
                        { "ticket", "t" },
                    }
                },
            });
            Equal(2, ticket.Addresses.Count, "reads every address in the list");
            Equal("1.2.3.4:100", ticket.Addresses[0].ToString(), "keeps the API's order (first)");
            Equal("5.6.7.8:200", ticket.Addresses[1].ToString(), "keeps the API's order (second)");
        }

        static void FallsBackToSingleLegacyAddress()
        {
            var ticket = RelayTicket.Read(new Dictionary<string, object>
            {
                { "relay", new Dictionary<string, object>
                    {
                        { "address", "1.2.3.4:100" },
                        { "ticket", "t" },
                    }
                },
            });
            Equal(1, ticket.Addresses.Count, "falls back to the single legacy address");
            Equal("1.2.3.4:100", ticket.Addresses[0].ToString(), "parses the legacy address");
        }

        static void PrefersTheListOverTheLegacyField()
        {
            var ticket = RelayTicket.Read(new Dictionary<string, object>
            {
                { "relay", new Dictionary<string, object>
                    {
                        { "addresses", new object[] { "1.2.3.4:100" } },
                        { "address", "9.9.9.9:900" },
                        { "ticket", "t" },
                    }
                },
            });
            Equal(1, ticket.Addresses.Count, "does not also append the legacy address");
            Equal("1.2.3.4:100", ticket.Addresses[0].ToString(), "the list wins over the legacy field");
        }

        static void ReturnsNullWithoutAnyAddress()
        {
            var ticket = RelayTicket.Read(new Dictionary<string, object>
            {
                { "relay", new Dictionary<string, object> { { "ticket", "t" } } },
            });
            if (ticket != null) throw new Exception("expected no relay ticket without an address");
        }

        static void EstimateUsesTheLowestMatchingRelayPair()
        {
            var row = new RoomRow
            {
                HostRelays = new List<RelayLeg>
                {
                    Leg("1.1.1.1:1", 100, 0),
                    Leg("2.2.2.2:2", 20, 0),
                },
            };
            var own = new List<RelayLeg>
            {
                Leg("1.1.1.1:1", 100, 0),
                Leg("2.2.2.2:2", 20, 0),
            };
            Equal(40, RoomBrowser.EstimateRelayRtt(row, own), "picks the relay with the lowest combined round trip");
        }

        static void EstimateIgnoresLossyLegs()
        {
            var row = new RoomRow
            {
                HostRelays = new List<RelayLeg>
                {
                    Leg("1.1.1.1:1", 5, 50),
                    Leg("2.2.2.2:2", 80, 0),
                },
            };
            var own = new List<RelayLeg>
            {
                Leg("1.1.1.1:1", 5, 0),
                Leg("2.2.2.2:2", 80, 0),
            };
            Equal(160, RoomBrowser.EstimateRelayRtt(row, own), "skips the relay whose host leg lost more than 10%");
        }

        static void EstimateFallsBackToTheLegacyFigure()
        {
            var row = new RoomRow { HostRelayRtt = 50 };
            var own = new List<RelayLeg> { Leg("1.1.1.1:1", 30, 0) };
            Equal(80, RoomBrowser.EstimateRelayRtt(row, own), "adds the legacy host figure to our own first relay");
        }

        static void RouteCheckReadsScoreAndLegacyLimits()
        {
            Yes(RouteThresholds.Read(new Dictionary<string, object>()) == null, "no route check without the field");
            Yes(RouteThresholds.Read(Answer(new Dictionary<string, object>())) == null, "no route check with an empty field");
            var scored = RouteThresholds.Read(Answer(new Dictionary<string, object> { { "lossCostMs", 10 }, { "switchMarginMs", 30 } }));
            Equal(10, scored.LossCostMs, "reads the loss cost alone");
            Equal(-1, scored.DirectLossPct, "leaves the legacy limit unset");
            var legacy = RouteThresholds.Read(Answer(new Dictionary<string, object> { { "directLossPct", 5 }, { "relayLossPct", 2 } }));
            Equal(5, legacy.DirectLossPct, "reads the legacy limits alone");
        }

        static void RouteCheckSwitchesOnScore()
        {
            var limits = new RouteThresholds { DirectLossPct = 5, RelayLossPct = 2, LossCostMs = 10, SwitchMarginMs = 30 };
            Yes(limits.PrefersRelay(Route(40, 8), Route(50, 0)), "leaves a lossy direct route for a near relay");
            No(limits.PrefersRelay(Route(180, 6), Route(500, 0)), "keeps a lossy direct route over a far relay");
            Yes(limits.PrefersRelay(Route(200, 30), Route(170, 1)), "leaves a very lossy direct route for a slower but clean relay");
            Yes(limits.PrefersRelay(Route(60, 3), Route(50, 0)), "switches below the legacy loss limit when the relay scores clearly better");
            No(limits.PrefersRelay(Route(60, 0), Route(40, 0)), "stays when the relay is better by no more than the margin");
            Yes(limits.PrefersRelay(Route(-1, 100), Route(80, 0)), "leaves a direct route that stopped answering");
            No(limits.PrefersRelay(Route(40, 50), Route(-1, 100)), "never moves to a relay that never answered");
        }

        static void RouteCheckFallsBackToLossLimits()
        {
            var limits = new RouteThresholds { DirectLossPct = 5, RelayLossPct = 2 };
            Yes(limits.PrefersRelay(Route(180, 6), Route(500, 0)), "an older API still switches on loss alone");
            No(limits.PrefersRelay(Route(60, 3), Route(50, 0)), "an older API keeps a direct route under its loss limit");
        }

        static void ProbeTakesTheBestAddressMedian()
        {
            var probe = new JoinTunnel.Probe();
            Equal(-1, probe.Rtt, "a probe without replies has no latency");
            probe.FirstReply = DateTime.UtcNow;
            probe.Rtts[new IPEndPoint(IPAddress.Parse("1.2.3.4"), 1)] = new List<int> { 500, 40, 42, 41, 300, 43 };
            probe.Rtts[new IPEndPoint(IPAddress.Parse("5.6.7.8"), 1)] = new List<int> { 90, 80, 85 };
            Equal(42, probe.Rtt, "skips the first reply and takes the median of the best address");
            No(probe.Done, "keeps probing until an address has enough replies");
            probe.Rtts[new IPEndPoint(IPAddress.Parse("5.6.7.8"), 1)] = new List<int> { 90, 80, 85, 80, 85, 80, 85, 80, 85, 80, 85 };
            Yes(probe.Done, "stops once an address has enough replies");
            probe = new JoinTunnel.Probe { FirstReply = DateTime.UtcNow.AddSeconds(-4) };
            Yes(probe.Done, "settles a while after the first reply even when replies keep getting lost");
        }

        static Dictionary<string, object> Answer(Dictionary<string, object> check)
        {
            return new Dictionary<string, object> { { "routeCheck", check } };
        }

        static RouteQuality Route(int rtt, int loss)
        {
            return new RouteQuality { Rtt = rtt, Loss = loss, Samples = 200 };
        }

        static void Yes(bool actual, string name)
        {
            if (!actual) throw new Exception(name + ": expected true");
        }

        static void No(bool actual, string name)
        {
            if (actual) throw new Exception(name + ": expected false");
        }

        static RelayLeg Leg(string address, int rtt, int loss)
        {
            return new RelayLeg(RelayTicket.Address(address)) { Quality = new RelayQuality { Rtt = rtt, Loss = loss } };
        }

        static void Equal(int expected, int actual, string name)
        {
            if (expected != actual) throw new Exception(name + ": expected " + expected + ", got " + actual);
        }

        static void Equal(string expected, string actual, string name)
        {
            if (!string.Equals(expected, actual, StringComparison.OrdinalIgnoreCase))
            {
                throw new Exception(name + ": expected " + (expected ?? "null") + ", got " + (actual ?? "null"));
            }
        }
    }
}
