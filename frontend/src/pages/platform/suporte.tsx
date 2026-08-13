/**
 * /platform/suporte — inbox multi-sessão do superadmin: todas as conversas
 * de suporte de todos os tenants, com resposta e triagem (aberta/resolvida).
 * Polling curto (8s), badge/som seguindo o mesmo padrão de admin/porta.tsx.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import PlatformLayout from "./layout";
import { apiClient, extractApiErrorMessage } from "../../services/api_client";

const POLLING_INTERVAL_MS = 8000;

interface ConversationSummary {
  id: string;
  tenant_id: string;
  tenant_name: string;
  owner_name_snapshot: string;
  status: "open" | "resolved";
  last_message_at: string | null;
  last_message_preview: string | null;
  unread: boolean;
}

interface Message {
  id: string;
  body: string;
  is_from_support: boolean;
  sender_name_snapshot: string;
  created_at: string;
}

type StatusFilter = "open" | "resolved" | "all";

function SuportePageContent() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seenMessageIds = useRef<Set<string>>(new Set());
  const firstMessagesLoad = useRef(true);
  const baseTitleRef = useRef<string | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await apiClient.get<ConversationSummary[]>("/api/v1/platform/support-chat/conversations", { params });
      setConversations(res.data);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Erro ao carregar conversas"));
    } finally {
      setLoadingList(false);
    }
  }, [statusFilter]);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const res = await apiClient.get<Message[]>(`/api/v1/platform/support-chat/conversations/${conversationId}/messages`);
      const incoming = res.data;

      if (!firstMessagesLoad.current) {
        const genuinelyNew = incoming.some((m) => !m.is_from_support && !seenMessageIds.current.has(m.id));
        if (genuinelyNew) {
          try { new Audio("/sounds/notification.mp3").play().catch(() => {}); } catch { /* non-critical */ }
        }
      }
      incoming.forEach((m) => seenMessageIds.current.add(m.id));
      firstMessagesLoad.current = false;

      setMessages(incoming);
    } catch {
      /* retry on next poll */
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") loadConversations();
    }, POLLING_INTERVAL_MS);
    return () => clearInterval(t);
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) return;
    firstMessagesLoad.current = true;
    seenMessageIds.current = new Set();
    setLoadingMessages(true);
    loadMessages(selectedId).finally(() => setLoadingMessages(false));

    apiClient.post(`/api/v1/platform/support-chat/conversations/${selectedId}/read`).catch(() => {});

    const t = setInterval(() => {
      if (document.visibilityState === "visible") loadMessages(selectedId);
    }, POLLING_INTERVAL_MS);
    return () => clearInterval(t);
  }, [selectedId, loadMessages]);

  // Título da aba com badge de conversas não lidas — mesmo padrão de admin/porta.tsx.
  const unreadCount = conversations.filter((c) => c.unread).length;
  useEffect(() => {
    if (baseTitleRef.current === null) baseTitleRef.current = document.title;
    const base = baseTitleRef.current;
    document.title = unreadCount > 0 ? `(${unreadCount}) ${base}` : base;
    return () => {
      if (baseTitleRef.current !== null) document.title = baseTitleRef.current;
    };
  }, [unreadCount]);

  const filtered = conversations.filter((c) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return c.tenant_name.toLowerCase().includes(q) || c.owner_name_snapshot.toLowerCase().includes(q);
  });

  const selected = conversations.find((c) => c.id === selectedId) || null;

  const handleSendReply = async () => {
    const body = reply.trim();
    if (!body || !selectedId || sending) return;
    setSending(true);
    try {
      await apiClient.post(`/api/v1/platform/support-chat/conversations/${selectedId}/messages`, { body });
      setReply("");
      await loadMessages(selectedId);
      await loadConversations();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Erro ao enviar resposta"));
    } finally {
      setSending(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!selected) return;
    const nextStatus = selected.status === "open" ? "resolved" : "open";
    try {
      await apiClient.patch(`/api/v1/platform/support-chat/conversations/${selected.id}/status`, { status: nextStatus });
      await loadConversations();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Erro ao atualizar status da conversa"));
    }
  };

  return (
    <>
      <Box sx={{ mb: 3, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Suporte</Typography>
          <Typography variant="body2" color="text.secondary">
            Conversas de suporte de todos os terreiros
          </Typography>
        </Box>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={statusFilter}
          onChange={(_, value) => value && setStatusFilter(value)}
        >
          <ToggleButton value="open">Abertas</ToggleButton>
          <ToggleButton value="resolved">Resolvidas</ToggleButton>
          <ToggleButton value="all">Todas</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Box sx={{ display: "flex", gap: 2, height: "calc(100vh - 240px)", minHeight: 420 }}>
        <Paper sx={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Box sx={{ p: 1.5 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Buscar por terreiro ou usuário…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Box>
          <Box sx={{ flex: 1, overflowY: "auto" }}>
            {loadingList ? (
              <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : filtered.length === 0 ? (
              <Box sx={{ p: 3 }}>
                <Typography variant="body2" color="text.secondary">Nenhuma conversa encontrada.</Typography>
              </Box>
            ) : (
              <List disablePadding>
                {filtered.map((c) => (
                  <ListItemButton
                    key={c.id}
                    selected={c.id === selectedId}
                    onClick={() => setSelectedId(c.id)}
                    sx={{ borderBottom: "1px solid", borderColor: "divider", alignItems: "flex-start", py: 1.25 }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                          <Typography variant="body2" fontWeight={c.unread ? 700 : 500} sx={{ flex: 1 }} noWrap>
                            {c.tenant_name}
                          </Typography>
                          {c.unread && <Chip label="Nova" size="small" color="warning" sx={{ height: 18, fontSize: '0.62rem' }} />}
                        </Box>
                      }
                      secondary={
                        <>
                          <Typography variant="caption" color="text.secondary" component="span" display="block">
                            {c.owner_name_snapshot}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" component="span" noWrap sx={{ display: 'block' }}>
                            {c.last_message_preview || "—"}
                          </Typography>
                        </>
                      }
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Box>
        </Paper>

        <Paper sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!selected ? (
            <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Typography variant="body2" color="text.secondary">Selecione uma conversa pra ver as mensagens.</Typography>
            </Box>
          ) : (
            <>
              <Box sx={{ p: 1.5, borderBottom: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", gap: 1.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" fontWeight={700} noWrap>{selected.tenant_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{selected.owner_name_snapshot}</Typography>
                </Box>
                <Chip
                  label={selected.status === "open" ? "Aberta" : "Resolvida"}
                  size="small"
                  color={selected.status === "open" ? "success" : "default"}
                  variant="outlined"
                />
                <IconButton size="small" onClick={handleToggleStatus} title={selected.status === "open" ? "Marcar como resolvida" : "Reabrir"}>
                  {selected.status === "open" ? <CheckCircleRoundedIcon fontSize="small" /> : <UndoRoundedIcon fontSize="small" />}
                </IconButton>
              </Box>

              {loadingMessages && messages.length === 0 ? (
                <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CircularProgress size={28} />
                </Box>
              ) : (
                <Box sx={{ flex: 1, overflowY: "auto", p: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                  {messages.map((m) => (
                    <Box
                      key={m.id}
                      sx={{
                        alignSelf: m.is_from_support ? "flex-end" : "flex-start",
                        maxWidth: "70%",
                        bgcolor: m.is_from_support ? "primary.main" : "action.selected",
                        color: m.is_from_support ? "primary.contrastText" : "text.primary",
                        borderRadius: 2,
                        px: 1.5, py: 1,
                      }}
                    >
                      <Typography variant="caption" sx={{ opacity: 0.75, display: "block", mb: 0.25 }}>
                        {m.sender_name_snapshot}
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {m.body}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}

              <Box sx={{ p: 1.25, borderTop: "1px solid", borderColor: "divider", display: "flex", gap: 1 }}>
                <TextField
                  size="small"
                  fullWidth
                  multiline
                  maxRows={4}
                  placeholder="Responder…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                  disabled={sending}
                />
                <IconButton color="primary" onClick={handleSendReply} disabled={sending || !reply.trim()} aria-label="Enviar resposta">
                  <SendRoundedIcon />
                </IconButton>
              </Box>
            </>
          )}
        </Paper>
      </Box>
    </>
  );
}

export default function PlatformSuportePage() {
  return (
    <PlatformLayout>
      <SuportePageContent />
    </PlatformLayout>
  );
}
