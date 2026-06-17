#!/usr/bin/env python3
"""
Batch runner for the Thermodynamic Economics Simulator.

This script complements the browser app by running repeatable parameter sweeps
and exporting CSV. It uses only the Python standard library.

Examples:
  python3 batch_runner.py --experiment baseline --steps 100000 --agents 500 --seeds 10
  python3 batch_runner.py --experiment tax_sweep --steps 100000 --agents 500 --seeds 20
  python3 batch_runner.py --experiment advantage_sweep --steps 100000 --agents 500 --seeds 10
  python3 batch_runner.py --experiment virtual_sweep --steps 5000 --agents 400 --seeds 5
"""

from __future__ import annotations

import argparse
import csv
import math
import os
import random
from dataclasses import asdict, dataclass
from typing import Callable, Iterable


@dataclass
class YardSaleParams:
    agents: int = 500
    initial_balance: float = 50.0
    fraction_risk: float = 0.10
    transaction_tax: float = 0.0
    wealth_tax: float = 0.0
    printed_ubi: float = 0.0
    wealth_advantage: float = 0.0
    policy_interval: int = 100


@dataclass
class VirtualParams:
    agents: int = 400
    initial_balance: float = 50.0
    creator_share: float = 0.35
    landlord_share: float = 0.08
    speculator_share: float = 0.07
    stipend: float = 0.025
    fraction_risk: float = 0.10
    transaction_tax: float = 0.025
    wealth_tax: float = 0.0
    policy_interval: int = 10
    demand_per_tick: int = 55
    production_chance: float = 0.08
    upload_fee: float = 0.45
    marketplace_fee: float = 0.06
    search_bias: float = 0.45
    land_price: float = 90.0
    max_land: int = 95
    land_rent: float = 0.04
    rent_seeking: float = 0.025


def gini(values: Iterable[float]) -> float:
    xs = sorted(max(0.0, float(x)) for x in values)
    n = len(xs)
    total = sum(xs)
    if n == 0 or total <= 0:
        return 0.0
    weighted = sum((i + 1) * x for i, x in enumerate(xs))
    return (2 * weighted) / (n * total) - (n + 1) / n


def top_share(values: Iterable[float], share: float) -> float:
    xs = sorted(max(0.0, float(x)) for x in values)
    n = len(xs)
    total = sum(xs)
    if n == 0 or total <= 0:
        return 0.0
    k = max(1, int(n * share))
    return sum(xs[-k:]) / total


def entropy(values: Iterable[float]) -> float:
    xs = [max(0.0, float(x)) for x in values]
    total = sum(xs)
    n = len(xs)
    if n <= 1:
        return 1.0
    if total <= 0:
        return 0.0
    h = 0.0
    for x in xs:
        if x > 0:
            p = x / total
            h -= p * math.log(p)
    return h / math.log(n)


def summarize_balances(balances: list[float]) -> dict[str, float]:
    total = sum(balances)
    avg = total / len(balances) if balances else 0.0
    return {
        "gini": gini(balances),
        "top1": top_share(balances, 0.01),
        "top10": top_share(balances, 0.10),
        "entropy": entropy(balances),
        "agent_money": total,
        "average_balance": avg,
        "rich_count_share": sum(1 for b in balances if b > 2 * avg) / len(balances) if balances else 0.0,
        "poor_count_share": sum(1 for b in balances if b < 0.5 * avg) / len(balances) if balances else 0.0,
    }


def simulate_yard_sale(params: YardSaleParams, steps: int, seed: int) -> dict[str, float | int | str]:
    rng = random.Random(seed)
    balances = [params.initial_balance for _ in range(params.agents)]
    tax_pool = 0.0
    transfer_volume = 0.0

    for t in range(1, steps + 1):
        if params.printed_ubi > 0:
            for i in range(params.agents):
                balances[i] += params.printed_ubi

        i, j = rng.sample(range(params.agents), 2)
        if balances[i] <= 0 or balances[j] <= 0:
            continue

        rich_i, poor_i = (i, j) if balances[i] >= balances[j] else (j, i)
        amount = balances[poor_i] * rng.random() * params.fraction_risk
        if amount <= 0:
            continue

        gap = (balances[rich_i] - balances[poor_i]) / max(balances[rich_i] + balances[poor_i], 1e-12)
        p_rich_wins = min(0.999, max(0.001, 0.5 + params.wealth_advantage * gap))
        winner = rich_i if rng.random() < p_rich_wins else poor_i
        loser = poor_i if winner == rich_i else rich_i

        amount = min(amount, balances[loser])
        tax = amount * params.transaction_tax
        balances[loser] -= amount
        balances[winner] += amount - tax
        tax_pool += tax
        transfer_volume += amount

        if t % params.policy_interval == 0:
            if params.wealth_tax > 0:
                for k, b in enumerate(balances):
                    wt = b * params.wealth_tax
                    balances[k] -= wt
                    tax_pool += wt
            if tax_pool > 0:
                dividend = tax_pool / params.agents
                for k in range(params.agents):
                    balances[k] += dividend
                tax_pool = 0.0

    out = summarize_balances(balances)
    out.update(asdict(params))
    out.update({
        "model": "yard_sale",
        "seed": seed,
        "steps": steps,
        "tax_pool": tax_pool,
        "transfer_volume": transfer_volume,
        "velocity": transfer_volume / max(sum(balances), 1e-12),
    })
    return out


def make_virtual_agents(params: VirtualParams, rng: random.Random) -> list[dict[str, float | str]]:
    agents = []
    for _ in range(params.agents):
        r = rng.random()
        if r < params.creator_share:
            role = "creator"
            reputation = rng.uniform(0.1, 0.8)
            inventory = rng.uniform(0, 8)
        elif r < params.creator_share + params.landlord_share:
            role = "landlord"
            reputation = rng.uniform(0.05, 0.25)
            inventory = 0.0
        elif r < params.creator_share + params.landlord_share + params.speculator_share:
            role = "speculator"
            reputation = rng.uniform(0.05, 0.25)
            inventory = 0.0
        else:
            role = "consumer"
            reputation = rng.uniform(0.05, 0.25)
            inventory = 0.0
        agents.append({
            "role": role,
            "balance": params.initial_balance,
            "skill": rng.uniform(0.45, 1.85),
            "reputation": reputation,
            "inventory": inventory,
            "land": 0.0,
            "utility": 0.0,
            "income": 0.0,
            "sales": 0.0,
        })
    return agents


def weighted_choice(rng: random.Random, items: list[dict], weight_fn: Callable[[dict], float]) -> dict | None:
    total = sum(max(0.0, weight_fn(item)) for item in items)
    if total <= 0:
        return rng.choice(items) if items else None
    r = rng.random() * total
    for item in items:
        r -= max(0.0, weight_fn(item))
        if r <= 0:
            return item
    return items[-1] if items else None


def simulate_virtual(params: VirtualParams, steps: int, seed: int) -> dict[str, float | int | str]:
    rng = random.Random(seed)
    agents = make_virtual_agents(params, rng)
    tax_pool = 0.0
    platform_treasury = 0.0
    energy_used = 0.0
    transactions = 0
    transfer_volume = 0.0

    for tick in range(1, steps + 1):
        if params.stipend > 0:
            for a in agents:
                a["balance"] += params.stipend

        # Creators produce and pay upload/listing fees.
        for a in agents:
            if a["role"] != "creator" or rng.random() >= params.production_chance:
                continue
            if a["balance"] < params.upload_fee:
                continue
            a["balance"] -= params.upload_fee
            platform_treasury += params.upload_fee
            output = a["skill"] * rng.uniform(0.6, 1.8) * (1 + 0.10 * a["land"])
            a["inventory"] += output
            a["reputation"] = min(20.0, a["reputation"] + 0.006 * a["skill"])

        # Land purchases from the platform.
        used_land = sum(a["land"] for a in agents)
        available = max(0, int(params.max_land - used_land))
        if available > 0:
            scarcity = used_land / params.max_land if params.max_land > 0 else 1.0
            price = params.land_price * (1 + 3 * scarcity * scarcity)
            for a in agents:
                if available <= 0:
                    break
                if a["role"] == "landlord":
                    chance = 0.030
                elif a["role"] == "speculator":
                    chance = 0.020
                elif a["role"] == "creator":
                    chance = 0.012
                else:
                    chance = 0.002
                chance *= min(3.0, max(0.15, a["balance"] / max(price, 1.0)))
                if a["balance"] > price and rng.random() < chance:
                    a["balance"] -= price
                    platform_treasury += price
                    a["land"] += 1
                    available -= 1

        # Rent-seeking: landowners sell access to attention/location.
        if params.rent_seeking > 0:
            landlords = [a for a in agents if a["land"] > 0 and a["role"] in ("landlord", "speculator")]
            tenants = [a for a in agents if a["role"] == "creator" and a["balance"] > 1]
            if landlords and tenants:
                for landlord in landlords:
                    if rng.random() >= 0.025:
                        continue
                    tenant = rng.choice(tenants)
                    rent = min(tenant["balance"], params.rent_seeking * (1 + landlord["land"]) * rng.uniform(0.5, 2.0))
                    if rent > 0:
                        tenant["balance"] -= rent
                        landlord["balance"] += rent
                        landlord["income"] += rent
                        transactions += 1
                        transfer_volume += rent

        buyers = [a for a in agents if a["balance"] > 0.25]
        sellers = [a for a in agents if a["role"] == "creator" and a["inventory"] > 0.1]
        if buyers and sellers:
            def visibility(s: dict) -> float:
                wealth_term = math.log1p(max(0.0, s["balance"])) / math.log(100 + params.initial_balance)
                rep_term = math.log1p(max(0.0, s["reputation"]))
                land_term = math.log1p(max(0.0, s["land"]))
                return max(0.01, 1 + params.search_bias * (0.55 * wealth_term + 1.3 * rep_term + 1.0 * land_term))

            for _ in range(params.demand_per_tick):
                buyer = rng.choice(buyers)
                if buyer["balance"] <= 0.25:
                    continue
                seller = weighted_choice(rng, sellers, lambda s: visibility(s) * max(0.1, math.sqrt(s["inventory"])))
                if seller is None or seller is buyer or seller["inventory"] <= 0:
                    continue
                price = rng.uniform(0.8, 4.5) * (1 + 0.18 * math.log1p(seller["reputation"])) * (1 + 0.05 * seller["land"])
                price = min(price, buyer["balance"] * 0.35)
                if price <= 0.05:
                    continue
                marketplace_fee = price * params.marketplace_fee
                tx_tax = price * params.transaction_tax
                seller_receives = max(0.0, price - marketplace_fee - tx_tax)
                buyer["balance"] -= price
                seller["balance"] += seller_receives
                seller["income"] += seller_receives
                seller["sales"] += 1
                seller["inventory"] = max(0.0, seller["inventory"] - rng.uniform(0.4, 1.2))
                seller["reputation"] += 0.004 + 0.0008 * price
                buyer["utility"] += price * rng.uniform(0.7, 1.6)
                platform_treasury += marketplace_fee
                tax_pool += tx_tax
                transactions += 1
                transfer_volume += price
                energy_used += 0.001

        for a in agents:
            if a["role"] == "creator":
                a["reputation"] *= 0.9996

        if tick % params.policy_interval == 0:
            if params.wealth_tax > 0:
                for a in agents:
                    wt = a["balance"] * params.wealth_tax
                    a["balance"] -= wt
                    tax_pool += wt
            if tax_pool > 0:
                dividend = tax_pool / params.agents
                for a in agents:
                    a["balance"] += dividend
                tax_pool = 0.0
            if params.land_rent > 0:
                for a in agents:
                    if a["land"] <= 0:
                        continue
                    tier = params.land_rent * a["land"]
                    if a["balance"] >= tier:
                        a["balance"] -= tier
                        platform_treasury += tier
                    else:
                        a["land"] = max(0.0, a["land"] - 1)

        energy_used += 0.000006 * params.agents

    balances = [a["balance"] for a in agents]
    out = summarize_balances(balances)
    out.update(asdict(params))
    out.update({
        "model": "virtual_world",
        "seed": seed,
        "steps": steps,
        "transactions": transactions,
        "tax_pool": tax_pool,
        "platform_treasury": platform_treasury,
        "total_land": sum(a["land"] for a in agents),
        "total_utility": sum(a["utility"] for a in agents),
        "creator_sales": sum(a["sales"] for a in agents if a["role"] == "creator"),
        "active_creators": sum(1 for a in agents if a["role"] == "creator" and (a["inventory"] > 0.1 or a["sales"] > 0)),
        "energy_used": energy_used,
        "transfer_volume": transfer_volume,
        "velocity": transfer_volume / max(sum(balances), 1e-12),
    })
    return out


def experiment_rows(name: str, steps: int, agents: int, seeds: int) -> list[dict]:
    rows: list[dict] = []

    if name == "baseline":
        configs = [
            ("baseline", YardSaleParams(agents=agents)),
            ("printed_ubi", YardSaleParams(agents=agents, printed_ubi=0.035)),
            ("transaction_tax", YardSaleParams(agents=agents, transaction_tax=0.06)),
            ("wealth_tax", YardSaleParams(agents=agents, wealth_tax=0.0012)),
            ("advantage", YardSaleParams(agents=agents, wealth_advantage=0.16)),
            ("advantage_taxed", YardSaleParams(agents=agents, wealth_advantage=0.14, transaction_tax=0.075)),
        ]
        for label, params in configs:
            for seed in range(1, seeds + 1):
                row = simulate_yard_sale(params, steps, seed)
                row["experiment"] = label
                rows.append(row)

    elif name == "tax_sweep":
        for tx_tax in [i / 100 for i in range(0, 21, 1)]:
            params = YardSaleParams(agents=agents, transaction_tax=tx_tax)
            for seed in range(1, seeds + 1):
                row = simulate_yard_sale(params, steps, seed)
                row["experiment"] = "tax_sweep"
                rows.append(row)

    elif name == "advantage_sweep":
        advantages = [0.00, 0.04, 0.08, 0.12, 0.16, 0.20]
        taxes = [0.00, 0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.15]
        for advantage in advantages:
            for tx_tax in taxes:
                params = YardSaleParams(agents=agents, wealth_advantage=advantage, transaction_tax=tx_tax)
                for seed in range(1, seeds + 1):
                    row = simulate_yard_sale(params, steps, seed)
                    row["experiment"] = "advantage_sweep"
                    rows.append(row)

    elif name == "ubi_sweep":
        for ubi in [0.00, 0.005, 0.010, 0.020, 0.035, 0.050, 0.075, 0.100, 0.150]:
            params = YardSaleParams(agents=agents, printed_ubi=ubi)
            for seed in range(1, seeds + 1):
                row = simulate_yard_sale(params, steps, seed)
                row["experiment"] = "ubi_sweep"
                rows.append(row)

    elif name == "virtual_sweep":
        for search_bias in [0.0, 0.25, 0.50, 0.75, 1.0, 1.25]:
            for marketplace_fee in [0.00, 0.03, 0.06, 0.10, 0.15]:
                params = VirtualParams(agents=agents, search_bias=search_bias, marketplace_fee=marketplace_fee)
                for seed in range(1, seeds + 1):
                    row = simulate_virtual(params, steps, seed)
                    row["experiment"] = "virtual_sweep"
                    rows.append(row)

    else:
        raise ValueError(f"Unknown experiment: {name}")

    return rows


def write_csv(rows: list[dict], path: str) -> None:
    if not rows:
        raise ValueError("No rows to write")
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    keys: list[str] = []
    for row in rows:
        for key in row.keys():
            if key not in keys:
                keys.append(key)
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def print_summary(rows: list[dict]) -> None:
    groups: dict[tuple, list[dict]] = {}
    for row in rows:
        key = (
            row.get("experiment"),
            row.get("transaction_tax"),
            row.get("wealth_advantage"),
            row.get("printed_ubi"),
            row.get("search_bias"),
            row.get("marketplace_fee"),
        )
        groups.setdefault(key, []).append(row)

    def avg(group: list[dict], key: str) -> float:
        vals = [float(r[key]) for r in group if key in r]
        return sum(vals) / len(vals) if vals else float("nan")

    print("\nSummary, averaged across seeds:")
    print("experiment, tx_tax, advantage, ubi, search_bias, fee, gini, top1, entropy, velocity")
    for key, group in list(groups.items())[:80]:
        exp, tx_tax, advantage, ubi, search_bias, fee = key
        print(
            f"{exp}, {tx_tax}, {advantage}, {ubi}, {search_bias}, {fee}, "
            f"{avg(group, 'gini'):.3f}, {avg(group, 'top1'):.3f}, "
            f"{avg(group, 'entropy'):.3f}, {avg(group, 'velocity'):.3f}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run thermodynamic economics parameter sweeps.")
    parser.add_argument("--experiment", choices=["baseline", "tax_sweep", "advantage_sweep", "ubi_sweep", "virtual_sweep"], default="baseline")
    parser.add_argument("--steps", type=int, default=100_000, help="Yard-sale trades or virtual-world ticks.")
    parser.add_argument("--agents", type=int, default=500)
    parser.add_argument("--seeds", type=int, default=10)
    parser.add_argument("--out", default=None, help="CSV output path.")
    args = parser.parse_args()

    rows = experiment_rows(args.experiment, args.steps, args.agents, args.seeds)
    out = args.out or f"results/{args.experiment}_steps{args.steps}_agents{args.agents}_seeds{args.seeds}.csv"
    write_csv(rows, out)
    print(f"Wrote {len(rows)} rows to {out}")
    print_summary(rows)


if __name__ == "__main__":
    main()
