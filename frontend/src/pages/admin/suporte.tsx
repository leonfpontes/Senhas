/**
 * /admin/suporte — visão agregada (read-only) das conversas de suporte de
 * todos os usuários do terreiro. Só ADMIN acessa; cada usuário responde na
 * própria conversa via o FAB global (SupportChatWidget), não aqui — esta
 * tela é só acompanhamento.
 */
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import AdminLayout from './admin_layout';
import { PageHeader } from '@/components/admin';
import { useProfile } from '@/hooks/useProfile';
import { apiClient } from '@/services/api_client';

const POLLING_INTERVAL_MS = 8000;

interface ConversationSummary {
  id: string;
  status: 'open' | 'resolved';
  owner_name_snapshot: string;
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

function AdminSuporteContent() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const res = await apiClient.get<ConversationSummary[]>('/api/v1/admin/support-chat/conversations');
      setConversations(res.data);
    } catch {
      /* retry on next poll */
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const res = await apiClient.get<Message[]>(`/api/v1/admin/support-chat/conversations/${conversationId}/messages`);
      setMessages(res.data);
    } catch {
      /* retry on next poll */
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') loadConversations();
    }, POLLING_INTERVAL_MS);
    return () => clearInterval(t);
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingMessages(true);
    loadMessages(selectedId).finally(() => setLoadingMessages(false));
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') loadMessages(selectedId);
    }, POLLING_INTERVAL_MS);
    return () => clearInterval(t);
  }, [selectedId, loadMessages]);

  return (
    <>
      <PageHeader
        title="Suporte"
        subtitle="Acompanhe as conversas de todos os usuários do seu terreiro com o suporte da plataforma."
      />

      {/* -90px reserva o canto inferior esquerdo pro FAB global de suporte (fixed, ~64px + respiro) */}
      <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 220px - 90px)', minHeight: 420 }}>
        <Paper sx={{ width: 320, flexShrink: 0, overflowY: 'auto' }}>
          {loadingList ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : conversations.length === 0 ? (
            <Box sx={{ p: 3 }}>
              <Typography variant="body2" color="text.secondary">
                Ninguém do seu terreiro falou com o suporte ainda.
              </Typography>
            </Box>
          ) : (
            <List disablePadding>
              {conversations.map((c) => (
                <ListItemButton
                  key={c.id}
                  selected={c.id === selectedId}
                  onClick={() => setSelectedId(c.id)}
                  sx={{ borderBottom: '1px solid', borderColor: 'divider', alignItems: 'flex-start', py: 1.25 }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" fontWeight={c.unread ? 700 : 500} sx={{ flex: 1 }}>
                          {c.owner_name_snapshot}
                        </Typography>
                        {c.unread && <Chip label="Nova resposta" size="small" color="warning" sx={{ height: 20, fontSize: '0.65rem' }} />}
                        <Chip
                          label={c.status === 'open' ? 'Aberta' : 'Resolvida'}
                          size="small"
                          color={c.status === 'open' ? 'success' : 'default'}
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                      </Box>
                    }
                    secondary={c.last_message_preview || '—'}
                    secondaryTypographyProps={{ noWrap: true }}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Paper>

        <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selectedId ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Selecione uma conversa pra ver as mensagens.
              </Typography>
            </Box>
          ) : loadingMessages && messages.length === 0 ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {messages.map((m) => (
                <Box
                  key={m.id}
                  sx={{
                    alignSelf: m.is_from_support ? 'flex-start' : 'flex-end',
                    maxWidth: '70%',
                    bgcolor: m.is_from_support ? 'action.selected' : 'primary.main',
                    color: m.is_from_support ? 'text.primary' : 'primary.contrastText',
                    borderRadius: 2,
                    px: 1.5, py: 1,
                  }}
                >
                  <Typography variant="caption" sx={{ opacity: 0.75, display: 'block', mb: 0.25 }}>
                    {m.sender_name_snapshot}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {m.body}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Paper>
      </Box>
    </>
  );
}

export default function AdminSuportePage() {
  const { profile, loading } = useProfile();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  return (
    <AdminLayout title="Suporte">
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : !isAdmin ? (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Você não tem permissão para visualizar as conversas de suporte do terreiro. Sua própria conversa continua disponível pelo botão de suporte.
        </Alert>
      ) : (
        <AdminSuporteContent />
      )}
    </AdminLayout>
  );
}
