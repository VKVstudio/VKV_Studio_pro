"""Explicit trusted configuration; no environment/credential discovery or server."""
from editorial import require
from pipeline import Pipeline
from private_api import PrivateAPI
from publication_policy import PublicationPolicy


def assemble(config, path, *, verifier=None, fixture_provider=None, validators=None):
    require(isinstance(config, dict) and set(config) == {"identity", "models", "limits", "providerMode", "networkCollectorEnabled"}, "invalid config")
    require(config["networkCollectorEnabled"] is False, "network collector forbidden")
    require(config["providerMode"] == "disabled" or (config["providerMode"] == "fixture" and fixture_provider is not None), "live provider unavailable")
    identity, limits, models = config["identity"], config["limits"], config["models"]
    require(isinstance(identity, dict) and set(identity) == {"issuer", "audience", "ownerSubject", "workerSubjects", "browserOrigin"}, "invalid identity config")
    require(isinstance(models, dict) and set(models) == {"extract", "draft", "skeptic", "repair", "images", "social"}, "invalid model config")
    require(all(value is None or (isinstance(value, str) and 1 <= len(value) <= 200 and not any(ord(c) <= 32 for c in value)) for value in models.values()), "invalid model ID")
    require(isinstance(identity["workerSubjects"], list) and len(identity["workerSubjects"]) <= 10
            and all(isinstance(x, str) and 1 <= len(x) <= 200 for x in identity["workerSubjects"]), "invalid worker pins")
    require(all(value is None or (isinstance(value, str) and 1 <= len(value) <= 200) for key, value in identity.items() if key != "workerSubjects"), "invalid identity pins")
    require(isinstance(limits, dict) and set(limits) == {"monthlyMicroUsd", "stageMicroUsd", "requestsPerMinute", "maxBodyBytes"}, "invalid limits")
    caps = limits["stageMicroUsd"]
    require(isinstance(caps, dict) and set(caps) == set(models), "invalid stage budgets")
    require(all(type(value) is int and 0 <= value <= 10_000_000 for value in caps.values()), "invalid budget")
    provider = fixture_provider if config["providerMode"] == "fixture" else None
    pipeline = Pipeline(path, provider=provider, monthly_micro_usd=limits["monthlyMicroUsd"], stage_caps={key: value for key,value in caps.items() if value > 0})
    # This trusted dependency is not read from request/model JSON. Defaults
    # retain pilot+kill and zero publication caps even with validators supplied.
    pipeline.publication_policy=PublicationPolicy(pipeline,gates=validators)
    api = PrivateAPI(pipeline, verifier=verifier, issuer=identity["issuer"], audience=identity["audience"],
                     owner_subject=identity["ownerSubject"], worker_subjects=identity["workerSubjects"], origin=identity["browserOrigin"],
                     requests_per_minute=limits["requestsPerMinute"], max_body=limits["maxBodyBytes"],publication_policy=pipeline.publication_policy)
    # Models are configuration metadata, not an assertion that a route/provider
    # has been tested or enabled. Fixture outputs do not contact these models.
    return pipeline, api
