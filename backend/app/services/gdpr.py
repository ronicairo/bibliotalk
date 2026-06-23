from fastapi import APIRouter, Form, Request
from fastapi.responses import JSONResponse
import datetime

router = APIRouter()

@router.post("/delete_request")
async def gdpr_delete_request(request: Request, email: str = Form(...)):
    """
    Reçoit une demande d'effacement de données (RGPD).
    - Stocke la demande dans un journal (email + IP + date)
    - Peut notifier l’admin (ex : mail, webhook, etc.)
    """
    timestamp = datetime.datetime.utcnow().isoformat()
    ip = request.client.host

    log_entry = f"[{timestamp}] Demande suppression pour {email} (IP={ip})\n"
    with open("gdpr_requests.log", "a") as f:
        f.write(log_entry)

    # TODO: notifier l'admin (send_mail_to_dpo(email) ou webhook Slack)

    return JSONResponse({
        "status": "ok",
        "message": "Votre demande d'effacement a bien été reçue. Elle sera traitée dans les 30 jours."
    })
