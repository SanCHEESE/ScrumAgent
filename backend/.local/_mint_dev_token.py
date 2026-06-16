"""Dev-only: seed a couple of users into the local SQLite and mint a JWT,
so we can exercise the authenticated wizard endpoints without real Google login.
Run with the same DATABASE_URL as the running server."""
from app.config import Settings
from app.database import init_db, make_engine, make_session_factory
from app.models import User
from app.security import create_access_token

s = Settings()
engine = make_engine(s.database_url)
init_db(engine)
db = make_session_factory(engine)()


def ensure(email: str, sub: str, name: str) -> User:
    u = db.query(User).filter(User.google_sub == sub).one_or_none()
    if u is None:
        u = User(google_sub=sub, email=email, name=name)
        db.add(u)
        db.commit()
        db.refresh(u)
    return u


dev = ensure("dev@municorn.com", "dev-sub", "Dev User")
ensure("bob@municorn.com", "bob-sub", "Bob Builder")
ensure("carol@municorn.com", "carol-sub", "Carol Diaz")

token = create_access_token(
    str(dev.id),
    s.secret_key,
    ttl_hours=24,
    extra={"email": dev.email, "env": s.app_environment},
)
print("USERID", dev.id)
print("ENV", s.app_environment)
print("TOKEN", token)
