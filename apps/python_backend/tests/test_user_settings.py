from __future__ import annotations

from routers.users import normalize_user_settings


def test_user_settings_normalizer_preserves_explicit_false_values():
    settings = normalize_user_settings(
        {
            "notification": {
                "smtpSecure": False,
                "onWarning": False,
            }
        }
    )

    assert settings["notification"]["smtpSecure"] is False
    assert settings["notification"]["onWarning"] is False
    assert settings["notification"]["onComplete"] is True
    assert settings["filePath"]["basePath"] == "C:\\data\\archive"


def test_user_settings_normalizer_returns_independent_documents():
    first = normalize_user_settings(None)
    first["filePath"]["projectName"] = "changed"

    second = normalize_user_settings(None)
    assert second["filePath"]["projectName"] == ""
