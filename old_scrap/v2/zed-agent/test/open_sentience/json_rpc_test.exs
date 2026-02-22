defmodule OpenSentience.JSONRPCTest do
  use ExUnit.Case, async: true

  alias OpenSentience.JSONRPC

  describe "request/3" do
    test "builds a JSON-RPC request with id, method, params" do
      msg = JSONRPC.request(1, "initialize", %{"protocolVersion" => 1})

      assert %{
               "jsonrpc" => "2.0",
               "id" => 1,
               "method" => "initialize",
               "params" => %{"protocolVersion" => 1}
             } = msg
    end

    test "drops nil id" do
      msg = JSONRPC.request(nil, "ping", %{})
      assert msg["jsonrpc"] == "2.0"
      assert msg["method"] == "ping"
      assert msg["params"] == %{}
      refute Map.has_key?(msg, "id")
    end
  end

  describe "notification/2" do
    test "builds a JSON-RPC notification without id" do
      msg = JSONRPC.notification("session/update", %{"x" => 1})

      assert %{
               "jsonrpc" => "2.0",
               "method" => "session/update",
               "params" => %{"x" => 1}
             } = msg

      refute Map.has_key?(msg, "id")
    end
  end

  describe "result/2" do
    test "builds a JSON-RPC success response" do
      msg = JSONRPC.result("abc", %{"ok" => true})

      assert %{
               "jsonrpc" => "2.0",
               "id" => "abc",
               "result" => %{"ok" => true}
             } = msg
    end
  end

  describe "error/4" do
    test "builds a JSON-RPC error response with code/message" do
      msg = JSONRPC.error(1, -32601, "Method not found")

      assert %{
               "jsonrpc" => "2.0",
               "id" => 1,
               "error" => %{"code" => -32601, "message" => "Method not found"}
             } = msg

      refute Map.has_key?(msg["error"], "data")
    end

    test "includes data when provided" do
      msg = JSONRPC.error(1, -32602, "Invalid params", %{"detail" => "x"})

      assert %{
               "jsonrpc" => "2.0",
               "id" => 1,
               "error" => %{
                 "code" => -32602,
                 "message" => "Invalid params",
                 "data" => %{"detail" => "x"}
               }
             } = msg
    end
  end

  describe "encode!/1 and encode_line!/1" do
    test "encodes a message to single-line JSON" do
      msg = JSONRPC.notification("ping", %{"a" => 1})
      json = JSONRPC.encode!(msg)

      assert is_binary(json)
      refute String.contains?(json, "\n")
      refute String.contains?(json, "\r")

      assert {:ok, decoded} = Jason.decode(json)
      assert decoded == msg
    end

    test "encode_line!/1 appends a newline" do
      msg = JSONRPC.notification("ping", %{"a" => 1})
      line = JSONRPC.encode_line!(msg)

      assert String.ends_with?(line, "\n")
      assert {:ok, decoded} = Jason.decode(String.trim_trailing(line, "\n"))
      assert decoded == msg
    end

    test "does not raise when values contain newline characters (they are escaped in JSON)" do
      msg = %{"jsonrpc" => "2.0", "method" => "ok", "params" => %{"text" => "a\nb\r\nc"}}
      json = JSONRPC.encode!(msg)

      assert is_binary(json)
      refute String.contains?(json, "\n")
      refute String.contains?(json, "\r")

      assert {:ok, decoded} = Jason.decode(json)
      assert decoded == msg
    end
  end

  describe "decode_line/1" do
    test "returns {:error, :empty} for empty/whitespace lines" do
      assert {:error, :empty} = JSONRPC.decode_line("")
      assert {:error, :empty} = JSONRPC.decode_line("   ")
      assert {:error, :empty} = JSONRPC.decode_line("\n")
      assert {:error, :empty} = JSONRPC.decode_line("\r\n")
    end

    test "decodes a JSON object line" do
      line = ~s({"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}) <> "\n"
      assert {:ok, msg} = JSONRPC.decode_line(line)
      assert msg["jsonrpc"] == "2.0"
      assert msg["id"] == 1
      assert msg["method"] == "initialize"
      assert msg["params"] == %{}
    end

    test "returns {:error, {:not_object, value}} when JSON isn't an object" do
      assert {:error, {:not_object, 123}} = JSONRPC.decode_line("123\n")
      assert {:error, {:not_object, [1, 2, 3]}} = JSONRPC.decode_line("[1,2,3]\n")
    end

    test "returns {:error, {:invalid_json, reason}} on invalid JSON" do
      assert {:error, {:invalid_json, _reason}} = JSONRPC.decode_line("{not json}\n")
    end
  end

  describe "validate_message/1" do
    test "accepts requests and notifications (method present) with correct version" do
      assert :ok =
               JSONRPC.validate_message(%{
                 "jsonrpc" => "2.0",
                 "id" => 1,
                 "method" => "initialize",
                 "params" => %{}
               })

      assert :ok =
               JSONRPC.validate_message(%{
                 "jsonrpc" => "2.0",
                 "method" => "session/cancel",
                 "params" => %{"sessionId" => "sess_1"}
               })
    end

    test "accepts responses with result" do
      assert :ok =
               JSONRPC.validate_message(%{
                 "jsonrpc" => "2.0",
                 "id" => "abc",
                 "result" => %{"ok" => true}
               })
    end

    test "accepts responses with error object" do
      assert :ok =
               JSONRPC.validate_message(%{
                 "jsonrpc" => "2.0",
                 "id" => 1,
                 "error" => %{"code" => -32601, "message" => "Method not found"}
               })
    end

    test "rejects invalid jsonrpc version" do
      assert {:error, :invalid_jsonrpc_version} =
               JSONRPC.validate_message(%{"jsonrpc" => "1.0", "method" => "x"})
    end

    test "rejects invalid message shape" do
      # Has jsonrpc but neither method nor result nor error
      assert {:error, :invalid_message_shape} =
               JSONRPC.validate_message(%{"jsonrpc" => "2.0", "id" => 1})
    end

    test "rejects invalid method type" do
      assert {:error, :invalid_method_type} =
               JSONRPC.validate_message(%{"jsonrpc" => "2.0", "method" => 123})
    end

    test "rejects invalid id type" do
      assert {:error, :invalid_id_type} =
               JSONRPC.validate_message(%{"jsonrpc" => "2.0", "id" => %{}, "method" => "x"})
    end

    test "rejects invalid error object" do
      assert {:error, :invalid_error_object} =
               JSONRPC.validate_message(%{
                 "jsonrpc" => "2.0",
                 "id" => 1,
                 "error" => %{"code" => "nope", "message" => 123}
               })
    end
  end
end
