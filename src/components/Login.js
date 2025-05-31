import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import {
  Box,
  Button,
  TextField,
  Typography,
  CircularProgress,
  Snackbar,
  Alert,
  Paper,
  Container
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Avatar from '@mui/material/Avatar';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ open: false, message: '', severity: 'info' });

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setFeedback({ open: false, message: '', severity: 'info' });

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) {
        setFeedback({ open: true, message: error.message || 'Falha no login. Verifique suas credenciais.', severity: 'error' });
      } else if (data.user) {
        // Login successful, App.js onAuthStateChange will handle the session update and redirect.
        // You could show a brief success message here if desired, but often not needed as the app will transition.
        // setFeedback({ open: true, message: 'Login bem-sucedido! Redirecionando...', severity: 'success' });
      } else {
        setFeedback({ open: true, message: 'Resposta inesperada do servidor.', severity: 'warning' });
      }
    } catch (error) {
      setFeedback({ open: true, message: 'Ocorreu um erro inesperado. Tente novamente.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setFeedback(prev => ({ ...prev, open: false }));
  };

  return (
    <Container component="main" maxWidth="xs">
      <Paper
        elevation={3}
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 4,
          borderRadius: 2, // Consistent with MuiPaper styleOverrides in App.js
        }}
      >
        <Avatar sx={{ m: 1, bgcolor: 'primary.main' }}>
          <LockOutlinedIcon />
        </Avatar>
        <Typography component="h1" variant="h5" sx={{ color: "primary.dark", fontWeight: 'bold' }}>
          Le Renovare - Login
        </Typography>
        <Box component="form" onSubmit={handleLogin} noValidate sx={{ mt: 2 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="Email"
            name="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Senha"
            type="password"
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          {/* TODO: Add forgot password link if needed */}
          {/* <Link href="#" variant="body2" sx={{ display: 'block', textAlign: 'right', mt: 1 }}>
            Esqueceu a senha?
          </Link> */}
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Entrar'}
          </Button>
          {/* TODO: Add sign up link if needed */}
          {/* <Grid container justifyContent="flex-end">
            <Grid item>
              <Link href="#" variant="body2">
                Não tem uma conta? Cadastre-se
              </Link>
            </Grid>
          </Grid> */}
        </Box>
      </Paper>
      <Snackbar
        open={feedback.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={feedback.severity} sx={{ width: '100%' }} variant="filled">
          {feedback.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}