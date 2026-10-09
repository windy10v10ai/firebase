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
