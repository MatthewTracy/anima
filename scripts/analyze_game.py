#!/usr/bin/env python3
"""
Post-Game Analysis Script for The Governance Game.

Reads JSON game logs and narrative logs from a session and produces
a summary report with scores, key events, and winner determination.

Usage:
    python scripts/analyze_game.py                     # Analyze most recent game
    python scripts/analyze_game.py logs/games/game_*.json  # Analyze specific file
"""

import json
import sys
import os
from pathlib import Path
from datetime import datetime


def load_latest_game_log():
    """Find and load the most recent game log."""
    log_dir = Path("logs/games")
    if not log_dir.exists():
        print("No game logs found. Run a game session first.")
        sys.exit(1)

    files = sorted(log_dir.glob("game_*.json"), key=os.path.getmtime, reverse=True)
    if not files:
        print("No game log files found in logs/games/")
        sys.exit(1)

    print(f"Loading: {files[0]}")
    with open(files[0]) as f:
        return json.load(f)


def calculate_weighted_score(scores):
    """Calculate the weighted composite score per the scoring rubric."""
    weights = {
        "totalResources": 0.25,
        "giniCoefficient": 0.15,  # Lower is better (more equal)
        "survivalRate": 0.20,
        "blocksPlaced": 0.15,
        "kills": 0.10,
    }

    result = {}
    for faction in ["constitutional", "anarchy"]:
        data = scores.get(faction, {})
        score = 0

        # Resources (higher is better)
        score += data.get("totalResources", 0) * weights["totalResources"]

        # Equality: 1 - gini (so 0 gini = 1.0 score, 1 gini = 0 score)
        gini = data.get("giniCoefficient", 0.5)
        score += (1 - gini) * 100 * weights["giniCoefficient"]

        # Blocks placed (higher is better)
        score += data.get("blocksPlaced", 0) * weights["blocksPlaced"]

        # Kills (higher is better)
        score += data.get("kills", 0) * 10 * weights["kills"]

        result[faction] = round(score, 2)

    return result


def extract_key_events(events):
    """Pull out the most interesting events from the game log."""
    key_types = {
        "election_called", "election_result", "law_enacted", "law_rejected",
        "lawsuit_filed", "verdict_rendered", "impeachment_initiated",
        "amendment_ratified", "combat_kill", "campaign_speech"
    }

    key_events = []
    for event in events:
        if event.get("type") in key_types:
            key_events.append(event)

    return key_events


def format_event(event):
    """Format a single event as a human-readable string."""
    etype = event.get("type", "unknown")
    time_str = event.get("time", "")

    if etype == "election_result":
        return f"  [{time_str}] ELECTION: {event.get('winner')} elected as {event.get('office')}"
    elif etype == "law_enacted":
        return f"  [{time_str}] LAW PASSED: \"{event.get('text')}\" ({event.get('yesVotes')}-{event.get('noVotes')})"
    elif etype == "law_rejected":
        return f"  [{time_str}] LAW FAILED: \"{event.get('text')}\" ({event.get('yesVotes')}-{event.get('noVotes')})"
    elif etype == "verdict_rendered":
        return f"  [{time_str}] VERDICT: {event.get('defendant')} found {event.get('verdict')} by Judge {event.get('judge')}"
    elif etype == "combat_kill":
        return f"  [{time_str}] KILL: {event.get('killer')} ({event.get('killer_faction')}) killed {event.get('victim')} ({event.get('victim_faction')})"
    elif etype == "impeachment_initiated":
        return f"  [{time_str}] IMPEACHMENT: {event.get('initiator')} moves to impeach {event.get('official')}"
    elif etype == "amendment_ratified":
        return f"  [{time_str}] AMENDMENT: \"{event.get('text')}\" ratified"
    elif etype == "campaign_speech":
        return f"  [{time_str}] SPEECH: {event.get('speaker')}: \"{event.get('speech', '')[:80]}...\""
    else:
        return f"  [{time_str}] {etype}: {json.dumps({k: v for k, v in event.items() if k not in ('type', 'time', 'timestamp', 'elapsed_ms')})}"


def print_report(data):
    """Print the full analysis report."""
    scores = data.get("scores", {})
    events = data.get("events", [])
    elapsed = data.get("elapsedMinutes", "?")

    print("\n" + "=" * 60)
    print("   THE GOVERNANCE GAME - POST-GAME ANALYSIS")
    print("=" * 60)
    print(f"\nSession: {data.get('sessionId', 'unknown')}")
    print(f"Duration: {elapsed} minutes")
    print(f"Total events logged: {data.get('eventCount', len(events))}")

    # Faction scores
    print("\n" + "-" * 40)
    print("FACTION SCORES")
    print("-" * 40)

    for faction in ["constitutional", "anarchy"]:
        fdata = scores.get(faction, {})
        print(f"\n  {faction.upper()} FACTION:")
        print(f"    Total Resources: {fdata.get('totalResources', 0)}")
        print(f"    Resource Equality (Gini): {fdata.get('giniCoefficient', 0):.3f}")
        print(f"    Combat Kills: {fdata.get('kills', 0)}")
        print(f"    Combat Deaths: {fdata.get('deaths', 0)}")
        print(f"    Blocks Placed: {fdata.get('blocksPlaced', 0)}")

        agent_resources = fdata.get("agentResources", {})
        if agent_resources:
            print(f"    Per-agent resources:")
            for agent, count in sorted(agent_resources.items()):
                print(f"      {agent}: {count}")

    # Weighted scores
    weighted = calculate_weighted_score(scores)
    print("\n" + "-" * 40)
    print("WEIGHTED COMPOSITE SCORES")
    print("-" * 40)
    for faction, score in weighted.items():
        print(f"  {faction.upper()}: {score}")

    winner = max(weighted, key=weighted.get) if weighted else "unknown"
    print(f"\n  >>> WINNER: {winner.upper()} FACTION <<<")

    # Key events
    key_events = extract_key_events(events)
    if key_events:
        print("\n" + "-" * 40)
        print(f"KEY EVENTS ({len(key_events)} total)")
        print("-" * 40)
        for event in key_events[:30]:  # Show top 30
            print(format_event(event))

    # Governance stats
    gov_events = [e for e in events if e.get("type", "").startswith(("election", "law", "lawsuit", "verdict", "impeach", "amendment"))]
    print(f"\n" + "-" * 40)
    print("GOVERNANCE ACTIVITY")
    print("-" * 40)
    print(f"  Elections held: {len([e for e in events if e.get('type') == 'election_result'])}")
    print(f"  Laws proposed: {len([e for e in events if e.get('type') == 'law_proposed'])}")
    print(f"  Laws enacted: {len([e for e in events if e.get('type') == 'law_enacted'])}")
    print(f"  Laws rejected: {len([e for e in events if e.get('type') == 'law_rejected'])}")
    print(f"  Lawsuits filed: {len([e for e in events if e.get('type') == 'lawsuit_filed'])}")
    print(f"  Verdicts rendered: {len([e for e in events if e.get('type') == 'verdict_rendered'])}")
    print(f"  Impeachments: {len([e for e in events if e.get('type') == 'impeachment_initiated'])}")
    print(f"  Amendments ratified: {len([e for e in events if e.get('type') == 'amendment_ratified'])}")

    print("\n" + "=" * 60)
    print("  End of Analysis")
    print("=" * 60 + "\n")


def main():
    if len(sys.argv) > 1:
        filepath = sys.argv[1]
        with open(filepath) as f:
            data = json.load(f)
    else:
        data = load_latest_game_log()

    print_report(data)


if __name__ == "__main__":
    main()
