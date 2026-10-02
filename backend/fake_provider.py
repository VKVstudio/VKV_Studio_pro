"""Deterministic offline test provider. Never uses HTTP or credentials."""
import copy
from editorial import EditorialError


class FakeProvider:
    fixture = True
    def __init__(self, outputs, cost_micro_usd=1):
        self.outputs = copy.deepcopy(outputs)
        self.cost = cost_micro_usd
        self.calls = []

    def generate(self, stage, data):
        self.calls.append((stage, data["candidate"]["id"]))
        if stage not in self.outputs:
            raise EditorialError("Missing offline fixture")
        return copy.deepcopy(self.outputs[stage]), self.cost
