import os

from mcp.client.streamable_http import streamablehttp_client
from strands.tools.mcp.mcp_client import MCPClient

# Nightlight's own MCP server, spec 2025-11-25 over Streamable HTTP.
#
# This is the same endpoint Alexa+ would call and the same one the local
# agent in apps/agent uses. The agent running here has no database access
# and no privileged path: it reaches the household only through these five
# tools. If the MCP surface were wrong, this agent would be wrong too,
# which is the cheapest proof that the surface is real.
DEFAULT_MCP_ENDPOINT = (
    "https://qdvxx267lgnsitq242aplz722a0zuien.lambda-url.us-east-1.on.aws/mcp"
)


def get_streamable_http_mcp_client() -> MCPClient:
    """An MCP client over Streamable HTTP, the transport the server speaks."""
    endpoint = os.environ.get("NIGHTLIGHT_MCP_URL", DEFAULT_MCP_ENDPOINT)
    return MCPClient(lambda: streamablehttp_client(endpoint))
