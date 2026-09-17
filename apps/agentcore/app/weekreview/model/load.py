import os

from strands.models.bedrock import BedrockModel

# The most capable Claude this AWS account can actually invoke.
#
# The scaffold defaults to a `global.` inference profile. This account's
# tier is allowlist-gated out of several current-generation Claude models
# on Bedrock, and the availability APIs do not surface that gate, so the
# only reliable way to know is to invoke (FRICTION_LOG.md entry 5). This is
# the profile verified working from the deployed Lambda, so it is the one
# used here rather than the one the template assumed.
DEFAULT_MODEL_ID = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"


def load_model() -> BedrockModel:
    """Bedrock model client, using the runtime's IAM role for credentials."""
    return BedrockModel(model_id=os.environ.get("BEDROCK_MODEL_ID", DEFAULT_MODEL_ID))
